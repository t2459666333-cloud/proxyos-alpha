import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const parser = resolve("rootfs/usr/libexec/proxyos/subscription_parser.py");
const python = process.platform === "win32" ? "python" : "python3";

function parsePayload(name, payload) {
  const directory = mkdtempSync(join(tmpdir(), "proxyos-sub-"));
  const input = join(directory, `${name}.txt`);
  const output = join(directory, `${name}.json`);
  writeFileSync(input, payload);
  const localPythonPath = resolve(".tools-cache/python");
  execFileSync(python, [parser, "--subscription-id", "sub-test", "--input", input, "--output", output], {
    env: { ...process.env, PYTHONPATH: [localPythonPath, process.env.PYTHONPATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":") },
  });
  return JSON.parse(readFileSync(output, "utf8"));
}

test("parses sing-box JSON and removes internal outbounds", () => {
  const result = parsePayload("singbox", JSON.stringify({
    outbounds: [
      { type: "direct", tag: "direct" },
      { type: "vless", tag: "Hong Kong", server: "hk.example.com", server_port: 443, uuid: "uuid-1" },
    ],
  }));
  assert.equal(result.format, "sing-box");
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].name, "Hong Kong");
  assert.equal(result.nodes[0].outbound.type, "vless");
});

test("parses Base64 share-link subscriptions", () => {
  const links = [
    "vless://uuid-2@us.example.com:443?security=tls&type=ws&path=%2Fws#United%20States",
    "trojan://secret@sg.example.com:443?sni=sg.example.com&security=tls#Singapore",
  ].join("\n");
  const result = parsePayload("base64", Buffer.from(links).toString("base64"));
  assert.equal(result.format, "base64-links");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0].outbound.transport.type, "ws");
  assert.equal(result.nodes[1].outbound.password, "secret");
});

test("parses plain multi-protocol share-link subscriptions", () => {
  const result = parsePayload("share-links", [
    "ss://YWVzLTEyOC1nY206c2VjcmV0QGhrLmV4YW1wbGUuY29tOjgzODg=#Hong%20Kong%20SS",
    "hysteria://password@hy.example.com:8443?security=tls&sni=hy.example.com#Hysteria",
    "socks5://user:pass@socks.example.com:1080#SOCKS",
  ].join("\n"));
  assert.equal(result.format, "share-links");
  assert.deepEqual(result.nodes.map((node) => node.outbound.type), [
    "shadowsocks",
    "hysteria",
    "socks",
  ]);
  assert.equal(result.nodes[1].outbound.auth_str, "password");
  assert.equal(result.nodes[1].outbound.up_mbps, 100);
});

test("parses Clash proxy objects", () => {
  const result = parsePayload("clash-json", JSON.stringify({
    proxies: [{
      name: "Japan 01",
      type: "ss",
      server: "jp.example.com",
      port: 8388,
      cipher: "2022-blake3-aes-128-gcm",
      password: "password",
    }],
  }));
  assert.equal(result.format, "clash-json");
  assert.equal(result.nodes[0].outbound.type, "shadowsocks");
  assert.equal(result.nodes[0].outbound.method, "2022-blake3-aes-128-gcm");
});

test("parses real Clash YAML subscriptions", () => {
  const result = parsePayload("clash-yaml", `
proxies:
  - name: "Hong Kong WS"
    type: vless
    server: hk.example.com
    port: 443
    uuid: uuid-yaml
    network: ws
    tls: true
    servername: hk.example.com
    ws-opts:
      path: /gateway
      headers:
        Host: hk.example.com
  - name: "Singapore HY2"
    type: hysteria2
    server: sg.example.com
    port: 8443
    password: secret
    sni: sg.example.com
    skip-cert-verify: false
`);
  assert.equal(result.format, "clash-yaml");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0].outbound.transport.type, "ws");
  assert.equal(result.nodes[0].outbound.tls.server_name, "hk.example.com");
  assert.equal(result.nodes[1].outbound.type, "hysteria2");
});

test("subscription node identity ignores display-name changes", () => {
  const first = parsePayload("stable-a", JSON.stringify({
    outbounds: [{ type: "socks", tag: "Old name", server: "node.example.com", server_port: 1080 }],
  }));
  const second = parsePayload("stable-b", JSON.stringify({
    outbounds: [{ type: "socks", tag: "New name", server: "node.example.com", server_port: 1080 }],
  }));
  assert.equal(first.nodes[0].id, second.nodes[0].id);
});
