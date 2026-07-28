#!/usr/bin/env python3
"""Normalize proxy subscriptions into ProxyOS sing-box node records."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit


INTERNAL_TYPES = {"direct", "block", "selector", "urltest", "dns"}
SUPPORTED_LINK_SCHEMES = {
    "ss",
    "vmess",
    "vless",
    "trojan",
    "hysteria",
    "hysteria2",
    "hy2",
    "tuic",
    "socks",
    "socks5",
    "http",
    "https",
    "ssh",
    "anytls",
    "wireguard",
}


def b64decode_text(value: str) -> str:
    value = re.sub(r"\s+", "", value)
    value += "=" * (-len(value) % 4)
    for decoder in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            return decoder(value.encode()).decode("utf-8-sig")
        except Exception:
            continue
    raise ValueError("invalid Base64 content")


def query_first(query: dict[str, list[str]], *names: str, default: str = "") -> str:
    for name in names:
        values = query.get(name)
        if values:
            return values[0]
    return default


def truthy(value: Any) -> bool:
    return str(value).lower() in {"1", "true", "yes", "on", "tls"}


def compact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: compact(item) for key, item in value.items() if item not in (None, "", [], {})}
    if isinstance(value, list):
        return [compact(item) for item in value if item not in (None, "", [], {})]
    return value


def transport_from_query(query: dict[str, list[str]]) -> dict[str, Any] | None:
    transport_type = query_first(query, "type", "network")
    if not transport_type or transport_type in {"tcp", "none"}:
        return None
    transport: dict[str, Any] = {"type": transport_type}
    path = query_first(query, "path")
    host = query_first(query, "host")
    service_name = query_first(query, "serviceName", "service_name")
    if path:
        transport["path"] = path
    if host:
        transport["headers"] = {"Host": host}
    if service_name:
        transport["service_name"] = service_name
    return transport


def tls_from_query(query: dict[str, list[str]], host: str) -> dict[str, Any] | None:
    security = query_first(query, "security")
    enabled = security in {"tls", "reality"} or truthy(query_first(query, "tls"))
    if not enabled:
        return None
    tls: dict[str, Any] = {
        "enabled": True,
        "server_name": query_first(query, "sni", "peer", default=host),
    }
    alpn = query_first(query, "alpn")
    if alpn:
        tls["alpn"] = [item for item in alpn.split(",") if item]
    insecure = query_first(query, "allowInsecure", "insecure", "skip-cert-verify")
    if insecure:
        tls["insecure"] = truthy(insecure)
    fingerprint = query_first(query, "fp", "fingerprint")
    if fingerprint:
        tls["utls"] = {"enabled": True, "fingerprint": fingerprint}
    public_key = query_first(query, "pbk", "public_key")
    short_id = query_first(query, "sid", "short_id")
    if security == "reality" or public_key:
        tls["reality"] = {"enabled": True, "public_key": public_key, "short_id": short_id}
    return compact(tls)


def parse_ss(link: str) -> tuple[str, dict[str, Any]]:
    raw = link[5:]
    fragment = ""
    if "#" in raw:
        raw, fragment = raw.split("#", 1)
    name = unquote(fragment) or "Shadowsocks"
    query_text = ""
    if "?" in raw:
        raw, query_text = raw.split("?", 1)
    query = parse_qs(query_text)

    if "@" in raw:
        userinfo, endpoint = raw.rsplit("@", 1)
        try:
            userinfo = b64decode_text(userinfo)
        except ValueError:
            userinfo = unquote(userinfo)
    else:
        decoded = b64decode_text(raw)
        if "@" not in decoded:
            raise ValueError("invalid Shadowsocks link")
        userinfo, endpoint = decoded.rsplit("@", 1)
    method, password = userinfo.split(":", 1)
    parsed = urlsplit(f"//{endpoint}")
    outbound: dict[str, Any] = {
        "type": "shadowsocks",
        "server": parsed.hostname,
        "server_port": parsed.port,
        "method": unquote(method),
        "password": unquote(password),
    }
    plugin = query_first(query, "plugin")
    if plugin:
        plugin_name, _, plugin_opts = plugin.partition(";")
        outbound["plugin"] = plugin_name
        outbound["plugin_opts"] = plugin_opts
    return name, compact(outbound)


def parse_vmess(link: str) -> tuple[str, dict[str, Any]]:
    payload = json.loads(b64decode_text(link[len("vmess://") :].split("#", 1)[0]))
    host = str(payload.get("add") or payload.get("server") or "")
    port = int(payload.get("port") or payload.get("server_port") or 0)
    name = str(payload.get("ps") or payload.get("tag") or f"{host}:{port}")
    outbound: dict[str, Any] = {
        "type": "vmess",
        "server": host,
        "server_port": port,
        "uuid": payload.get("id") or payload.get("uuid"),
        "security": payload.get("scy") or payload.get("security") or "auto",
        "alter_id": int(payload.get("aid") or payload.get("alterId") or 0),
    }
    network = payload.get("net") or payload.get("network")
    if network and network != "tcp":
        outbound["transport"] = compact(
            {
                "type": network,
                "path": payload.get("path"),
                "headers": {"Host": payload.get("host")} if payload.get("host") else None,
                "service_name": payload.get("path") if network == "grpc" else None,
            }
        )
    if payload.get("tls") in {"tls", True, "true"}:
        outbound["tls"] = compact(
            {
                "enabled": True,
                "server_name": payload.get("sni") or payload.get("host") or host,
                "insecure": truthy(payload.get("allowInsecure", False)),
            }
        )
    return name, compact(outbound)


def parse_standard_uri(link: str) -> tuple[str, dict[str, Any]]:
    parsed = urlsplit(link)
    scheme = parsed.scheme.lower()
    query = parse_qs(parsed.query)
    host = parsed.hostname or ""
    port = parsed.port or (443 if scheme in {"https", "trojan", "vless", "anytls"} else 1080)
    name = unquote(parsed.fragment) or f"{host}:{port}"
    username = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    outbound_type = {"hy2": "hysteria2", "socks5": "socks", "https": "http"}.get(scheme, scheme)
    outbound: dict[str, Any] = {"type": outbound_type, "server": host, "server_port": port}

    if outbound_type in {"vless", "vmess"}:
        outbound["uuid"] = username
        if outbound_type == "vless":
            flow = query_first(query, "flow")
            if flow:
                outbound["flow"] = flow
    elif outbound_type in {"trojan", "hysteria", "hysteria2", "anytls"}:
        outbound["password"] = username or password or query_first(query, "auth")
    elif outbound_type == "tuic":
        outbound["uuid"] = username
        outbound["password"] = password
        outbound["congestion_control"] = query_first(query, "congestion_control", "congestion-control")
        outbound["udp_relay_mode"] = query_first(query, "udp_relay_mode", "udp-relay-mode")
    elif outbound_type in {"socks", "http", "ssh"}:
        outbound["username"] = username
        outbound["password"] = password
        if scheme == "https":
            outbound["tls"] = {"enabled": True, "server_name": query_first(query, "sni", default=host)}
    elif outbound_type == "wireguard":
        outbound.update(
            compact(
                {
                    "private_key": query_first(query, "private_key", "private-key", default=username),
                    "peer_public_key": query_first(query, "public_key", "public-key"),
                    "pre_shared_key": query_first(query, "preshared_key", "pre-shared-key"),
                    "local_address": query_first(query, "address", "local_address").split(","),
                    "reserved": [
                        int(part) for part in query_first(query, "reserved").split(",") if part.isdigit()
                    ],
                }
            )
        )

    transport = transport_from_query(query)
    tls = tls_from_query(query, host)
    if transport:
        outbound["transport"] = transport
    if tls and outbound_type not in {"http", "socks", "ssh", "wireguard"}:
        outbound["tls"] = tls
    return name, compact(outbound)


def parse_link(link: str) -> tuple[str, dict[str, Any]]:
    link = link.strip()
    scheme = link.split(":", 1)[0].lower()
    if scheme not in SUPPORTED_LINK_SCHEMES:
        raise ValueError(f"unsupported share-link protocol: {scheme}")
    if scheme == "ss":
        return parse_ss(link)
    if scheme == "vmess":
        return parse_vmess(link)
    return parse_standard_uri(link)


def clash_proxy_to_outbound(proxy: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    proxy_type = str(proxy.get("type", "")).lower()
    outbound_type = {
        "ss": "shadowsocks",
        "socks5": "socks",
        "hy2": "hysteria2",
        "hysteria": "hysteria",
        "wg": "wireguard",
    }.get(proxy_type, proxy_type)
    host = proxy.get("server")
    port = int(proxy.get("port") or 0)
    name = str(proxy.get("name") or f"{host}:{port}")
    outbound: dict[str, Any] = {"type": outbound_type, "server": host, "server_port": port}

    if outbound_type == "shadowsocks":
        outbound.update({"method": proxy.get("cipher"), "password": proxy.get("password")})
        if proxy.get("plugin"):
            outbound["plugin"] = proxy.get("plugin")
            opts = proxy.get("plugin-opts") or {}
            if isinstance(opts, dict):
                outbound["plugin_opts"] = ";".join(f"{key}={value}" for key, value in opts.items())
    elif outbound_type in {"vmess", "vless"}:
        outbound["uuid"] = proxy.get("uuid")
        if outbound_type == "vmess":
            outbound["security"] = proxy.get("cipher") or "auto"
            outbound["alter_id"] = int(proxy.get("alterId") or proxy.get("alter-id") or 0)
        elif proxy.get("flow"):
            outbound["flow"] = proxy.get("flow")
    elif outbound_type in {"trojan", "hysteria2", "hysteria", "anytls"}:
        outbound["password"] = proxy.get("password") or proxy.get("auth") or proxy.get("auth-str")
    elif outbound_type == "tuic":
        outbound.update(
            {
                "uuid": proxy.get("uuid"),
                "password": proxy.get("password"),
                "congestion_control": proxy.get("congestion-controller") or proxy.get("congestion_control"),
                "udp_relay_mode": proxy.get("udp-relay-mode") or proxy.get("udp_relay_mode"),
            }
        )
    elif outbound_type in {"socks", "http", "ssh"}:
        outbound.update({"username": proxy.get("username"), "password": proxy.get("password")})
    elif outbound_type == "wireguard":
        outbound.update(
            {
                "private_key": proxy.get("private-key") or proxy.get("private_key"),
                "peer_public_key": proxy.get("public-key") or proxy.get("public_key"),
                "pre_shared_key": proxy.get("pre-shared-key") or proxy.get("pre_shared_key"),
                "local_address": proxy.get("ip") or proxy.get("address"),
                "reserved": proxy.get("reserved"),
            }
        )

    network = proxy.get("network")
    if network and network != "tcp":
        opts = proxy.get(f"{network}-opts") or {}
        outbound["transport"] = compact(
            {
                "type": network,
                "path": opts.get("path") if isinstance(opts, dict) else None,
                "headers": opts.get("headers") if isinstance(opts, dict) else None,
                "service_name": (
                    opts.get("grpc-service-name") or opts.get("service-name")
                    if isinstance(opts, dict)
                    else None
                ),
            }
        )

    if truthy(proxy.get("tls")) or proxy.get("reality-opts"):
        reality = proxy.get("reality-opts") or {}
        outbound["tls"] = compact(
            {
                "enabled": True,
                "server_name": proxy.get("servername") or proxy.get("sni") or host,
                "insecure": truthy(proxy.get("skip-cert-verify")),
                "alpn": proxy.get("alpn"),
                "utls": (
                    {"enabled": True, "fingerprint": proxy.get("client-fingerprint")}
                    if proxy.get("client-fingerprint")
                    else None
                ),
                "reality": (
                    {
                        "enabled": True,
                        "public_key": reality.get("public-key"),
                        "short_id": reality.get("short-id"),
                    }
                    if reality
                    else None
                ),
            }
        )
    return name, compact(outbound)


def detect_payload(text: str) -> tuple[str, list[tuple[str, dict[str, Any]]]]:
    stripped = text.strip().lstrip("\ufeff")
    parsed_json: Any = None
    try:
        parsed_json = json.loads(stripped)
    except json.JSONDecodeError:
        pass

    if isinstance(parsed_json, dict) and isinstance(parsed_json.get("outbounds"), list):
        return "sing-box", [
            (str(item.get("tag") or f"{item.get('server', '')}:{item.get('server_port', '')}"), item)
            for item in parsed_json["outbounds"]
            if isinstance(item, dict) and item.get("type") not in INTERNAL_TYPES
        ]
    if isinstance(parsed_json, list):
        return "sing-box", [
            (str(item.get("tag") or f"{item.get('server', '')}:{item.get('server_port', '')}"), item)
            for item in parsed_json
            if isinstance(item, dict) and item.get("type") not in INTERNAL_TYPES
        ]
    if isinstance(parsed_json, dict) and isinstance(parsed_json.get("proxies"), list):
        return "clash-json", [clash_proxy_to_outbound(item) for item in parsed_json["proxies"]]

    if re.search(r"(?m)^\s*proxies\s*:", stripped):
        try:
            import yaml  # type: ignore
        except ImportError as exc:
            raise ValueError("Clash YAML support requires python3-yaml") from exc
        payload = yaml.safe_load(stripped)
        proxies = payload.get("proxies") if isinstance(payload, dict) else None
        if not isinstance(proxies, list):
            raise ValueError("Clash YAML does not contain a proxies list")
        return "clash-yaml", [clash_proxy_to_outbound(item) for item in proxies if isinstance(item, dict)]

    candidate = stripped
    if not any(candidate.startswith(f"{scheme}://") for scheme in SUPPORTED_LINK_SCHEMES):
        try:
            candidate = b64decode_text(candidate)
        except ValueError:
            pass
    links = [
        line.strip()
        for line in re.split(r"[\r\n]+", candidate)
        if "://" in line and not line.lstrip().startswith("#")
    ]
    if not links:
        raise ValueError("unrecognized subscription format")
    return ("base64-links" if candidate != stripped else "share-links"), [parse_link(link) for link in links]


def stable_id(subscription_id: str, outbound: dict[str, Any]) -> str:
    transport = outbound.get("transport") if isinstance(outbound.get("transport"), dict) else {}
    identity = {
        "type": outbound.get("type"),
        "server": outbound.get("server"),
        "server_port": outbound.get("server_port"),
        "uuid": outbound.get("uuid"),
        "username": outbound.get("username"),
        "method": outbound.get("method"),
        "transport": transport.get("type"),
    }
    digest = hashlib.sha256(
        f"{subscription_id}|{json.dumps(identity, sort_keys=True, separators=(',', ':'))}".encode()
    ).hexdigest()
    return digest[:16]


def normalize(subscription_id: str, text: str) -> dict[str, Any]:
    detected_format, entries = detect_payload(text)
    nodes: list[dict[str, Any]] = []
    seen: set[str] = set()
    for name, raw_outbound in entries:
        outbound = compact(dict(raw_outbound))
        outbound.pop("tag", None)
        if outbound.get("type") in INTERNAL_TYPES:
            continue
        if not outbound.get("type") or not outbound.get("server") or not outbound.get("server_port"):
            continue
        node_id = stable_id(subscription_id, outbound)
        if node_id in seen:
            continue
        seen.add(node_id)
        nodes.append(
            {
                "id": node_id,
                "name": name or f"{outbound['server']}:{outbound['server_port']}",
                "source_type": "subscription",
                "source_id": subscription_id,
                "enabled": True,
                "status": "unknown",
                "latency_ms": None,
                "outbound": outbound,
            }
        )
    if not nodes:
        raise ValueError("subscription contains no supported proxy nodes")
    return {"format": detected_format, "nodes": nodes}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subscription-id", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        result = normalize(args.subscription_id, Path(args.input).read_text(encoding="utf-8-sig"))
        Path(args.output).write_text(
            json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
