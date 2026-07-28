import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../rootfs/www");
const port = Number(process.env.PORT || 4173);

const mock = {
  status: {
    version: "0.2.2-alpha",
    hostname: "ProxyOS",
    model: "Intel N100 · x86-64",
    kernel: "6.12.74",
    uptime: 187440,
    load: [10680, 7220, 5080],
    memory: {
      total: 8589934592,
      free: 3221225472,
      buffered: 536870912,
      cached: 2147483648,
    },
    node_count: 6,
    bound_device_count: 4,
    singbox_running: true,
  },
  devices: [
    { name: "iPhone 16 Pro", mac: "AA:BB:CC:10:20:01", ip: "192.168.10.101", online: true, policy: "fixed_node", node_id: "hk01", backup_node_id: "sg01", failure_mode: "backup", auto_source: "all", connection: "Wi‑Fi 5 GHz", signal: -42, band: "5GHz" },
    { name: "Pixel 10", mac: "AA:BB:CC:10:20:02", ip: "192.168.10.102", online: true, policy: "fixed_node", node_id: "us02", connection: "Wi‑Fi 5 GHz" },
    { name: "Workstation", mac: "AA:BB:CC:10:20:03", ip: "192.168.10.103", online: true, policy: "fixed_node", node_id: "jp01", connection: "2.5G LAN" },
    { name: "Living Room TV", mac: "AA:BB:CC:10:20:04", ip: "192.168.10.104", online: true, policy: "direct", node_id: "", connection: "Wi‑Fi 5 GHz" },
    { name: "iPad Air", mac: "AA:BB:CC:10:20:05", ip: "192.168.10.105", online: false, policy: "block", node_id: "", connection: "Wi‑Fi 5 GHz" },
  ],
  nodes: [
    { id: "hk01", name: "香港 01", protocol: "vless", source_type: "subscription", source_id: "sub01", server: "hk.example.com", server_port: 443, enabled: true },
    { id: "us02", name: "美国住宅 02", protocol: "trojan", source_type: "subscription", source_id: "sub02", server: "us.example.com", server_port: 443, enabled: true },
    { id: "jp01", name: "日本手动线路", protocol: "socks", source_type: "manual", source_id: "", server: "jp.example.com", server_port: 1080, enabled: true },
    { id: "sg01", name: "新加坡 01", protocol: "hysteria2", source_type: "subscription", source_id: "sub01", server: "sg.example.com", server_port: 8443, enabled: true },
    { id: "de01", name: "德国 01", protocol: "vmess", source_type: "subscription", source_id: "sub02", server: "de.example.com", server_port: 443, enabled: true },
    { id: "uk01", name: "英国 01", protocol: "shadowsocks", source_type: "manual", source_id: "", server: "uk.example.com", server_port: 8388, enabled: true },
  ],
  wifi_status: { available: true, enabled: true, phy: "phy0", driver: "mt7921e", reason: "" },
  wifi_config: {
    available: true,
    enabled: true,
    guest_enabled: false,
    bands: [
      { radio: "radio0", band: "2g", ssid: "ProxyOS-2.4G", encryption: "sae-mixed", channel: "6", htmode: "HE40", country: "CN", enabled: true },
      { radio: "radio1", band: "5g", ssid: "ProxyOS-5G", encryption: "sae-mixed", channel: "36", htmode: "HE80", country: "CN", enabled: true },
    ],
  },
  policy_settings: { default_policy: "direct", default_node_id: "", health_interval: 300, health_batch_size: 8, fail_closed: true },
  ports: [
    { name: "eth0", mac: "00:11:22:33:44:01", state: "up", speed_mbps: 2500, driver: "igc", role: "wan" },
    { name: "eth1", mac: "00:11:22:33:44:02", state: "up", speed_mbps: 2500, driver: "igc", role: "lan" },
    { name: "eth2", mac: "00:11:22:33:44:03", state: "down", speed_mbps: 0, driver: "igc", role: "lan" },
    { name: "eth3", mac: "00:11:22:33:44:04", state: "down", speed_mbps: 0, driver: "igc", role: "unused" },
  ],
  subscriptions: [
    { id: "sub01", name: "主线路订阅", url: "https://example.com/main", format: "clash-yaml", node_count: 3, skipped_count: 0, last_update: Math.floor(Date.now() / 1000) - 1840, status: "ok", url_configured: true },
    { id: "sub02", name: "备用线路订阅", url: "https://example.com/backup", format: "base64", node_count: 2, skipped_count: 1, warning: "已跳过 1 个不兼容节点", last_update: Math.floor(Date.now() / 1000) - 920, status: "ok", url_configured: true },
  ],
};

function rpcResult(id, data, code = 0) {
  return JSON.stringify({ jsonrpc: "2.0", id, result: [code, data] });
}

async function handleRpc(request, response) {
  let body = "";
  for await (const chunk of request) body += chunk;
  const envelope = JSON.parse(body || "{}");
  const [, object, method, params = {}] = envelope.params || [];
  let data = {};

  if (object === "session" && method === "login") {
    data = { ubus_rpc_session: "preview-session" };
  } else if (object === "proxyos") {
    if (method in mock) data = mock[method];
    else if (method === "node_add") {
      const outbound = JSON.parse(params.outbound_json);
      mock.nodes.push({
        id: `node-${Date.now()}`,
        name: params.name,
        protocol: outbound.type,
        source_type: "manual",
        source_id: "",
        server: outbound.server || "",
        server_port: outbound.server_port || 0,
        enabled: true,
      });
      mock.status.node_count = mock.nodes.length;
      data = { ok: true };
    } else if (method === "node_get") {
      const node = mock.nodes.find((item) => item.id === params.id);
      data = { ...node, outbound_json: JSON.stringify({ type: node.protocol, server: node.server, server_port: node.server_port }) };
    } else if (method === "node_update") {
      const outbound = JSON.parse(params.outbound_json);
      mock.nodes = mock.nodes.map((node) => node.id === params.id ? { ...node, name: params.name, protocol: outbound.type, server: outbound.server, server_port: outbound.server_port } : node);
      data = { ok: true };
    } else if (method === "node_delete") {
      mock.nodes = mock.nodes.filter((node) => node.id !== params.id);
      mock.devices = mock.devices.map((device) =>
        device.node_id === params.id
          ? { ...device, policy: "block", node_id: "" }
          : device,
      );
      mock.status.node_count = mock.nodes.length;
      data = { ok: true };
    } else if (method === "device_bind") {
      mock.devices = mock.devices.map((device) =>
        device.mac === params.mac ? { ...device, ...params } : device,
      );
      mock.status.bound_device_count = mock.devices.filter((device) => device.policy === "fixed_node").length;
      data = { ok: true };
    } else if (method === "wifi_toggle") {
      mock.wifi_status.enabled = params.enabled;
      mock.wifi_config.enabled = params.enabled;
      data = { ok: true };
    } else if (method === "wifi_apply") {
      mock.wifi_config.bands[0].ssid = params.ssid_24;
      mock.wifi_config.bands[1].ssid = params.ssid_5;
      mock.wifi_config.guest_enabled = params.guest_enabled;
      data = { ok: true };
    } else if (method === "ports_apply" || method === "ports_confirm" || method === "apply") {
      data = { ok: true, confirmation_timeout: 90 };
    } else if (method === "subscription_add") {
      const id = `sub-${Date.now()}`;
      mock.subscriptions.push({
        id,
        name: params.name,
        url: params.url,
        format: "sing-box",
        node_count: 0,
        skipped_count: 0,
        last_update: 0,
        status: "new",
        url_configured: true,
      });
      data = { ok: true, id };
    } else if (method === "subscription_update") {
      mock.subscriptions = mock.subscriptions.map((item) =>
        item.id === params.id
          ? { ...item, last_update: Math.floor(Date.now() / 1000), status: "ok" }
          : item,
      );
      const subscription = mock.subscriptions.find((item) => item.id === params.id);
      data = { ok: true, node_count: subscription?.node_count || 0, skipped_count: subscription?.skipped_count || 0 };
    } else if (method === "subscription_get") {
      data = mock.subscriptions.find((item) => item.id === params.id) || { ok: false, error: "Subscription not found" };
    } else if (method === "subscription_save") {
      mock.subscriptions = mock.subscriptions.map((item) =>
        item.id === params.id ? { ...item, name: params.name, url: params.url } : item,
      );
      data = { ok: true, id: params.id };
    } else if (method === "subscription_delete") {
      mock.subscriptions = mock.subscriptions.filter((item) => item.id !== params.id);
      data = { ok: true };
    } else if (method === "policy_apply") {
      mock.policy_settings = { ...mock.policy_settings, ...params };
      data = { ok: true };
    } else if (method === "system_logs") {
      data = { items: ["proxyos: configuration loaded", "proxyos: sing-box is running"] };
    } else if (method === "egress_check") {
      data = { ok: true, ip: "203.0.113.10", mode: "node", blocked: false };
    } else if (method === "update_check") {
      data = { ok: true, current_version: "0.2.2-alpha", latest_version: "0.2.2-alpha", available: false };
    } else if (method === "backup_create") {
      data = { ok: true, filename: "ProxyOS-backup-preview.tar.gz", data_base64: "H4sIAAAAAAACAAMAAAAAAAAAAA==" };
    } else {
      data = { ok: true };
    }
  }

  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(rpcResult(envelope.id, data));
}

createServer(async (request, response) => {
  try {
    if (request.url === "/ubus" && request.method === "POST") {
      await handleRpc(request, response);
      return;
    }
    const urlPath = new URL(request.url, "http://localhost").pathname;
    const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, "index.html")) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const extension = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
    };
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`ProxyOS UI preview: http://127.0.0.1:${port}`);
});
