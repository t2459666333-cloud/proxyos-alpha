import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controller = await readFile(new URL("../rootfs/usr/libexec/proxyos/proxyosctl", import.meta.url), "utf8");
const rpcPlugin = await readFile(new URL("../rootfs/usr/libexec/rpcd/proxyos", import.meta.url), "utf8");
const acl = await readFile(new URL("../rootfs/usr/share/rpcd/acl.d/proxyos.json", import.meta.url), "utf8");
const webApp = await readFile(new URL("../rootfs/www/assets/app.js", import.meta.url), "utf8");
const index = await readFile(new URL("../rootfs/www/index.html", import.meta.url), "utf8");
const healthService = await readFile(new URL("../rootfs/etc/init.d/proxyos-health", import.meta.url), "utf8");

test("new and changed nodes wait for a manual IP type test", () => {
  assert.match(controller, /ip_type:"unknown",ip_type_status:"untested"/);
  assert.match(controller, /node-ip-type-test\) node_ip_type_test/);
  assert.doesNotMatch(controller, /trigger_ip_intelligence_worker/);
  assert.doesNotMatch(controller, /ip-intelligence-refresh/);
  assert.doesNotMatch(healthService, /ip-intelligence-refresh/);
});

test("manual type test uses the real node exit and cached provider response", () => {
  assert.match(controller, /probe_node_exit_ip\(\)/);
  assert.match(controller, /fetch_public_ip "socks5h:\/\/127\.0\.0\.1:\$\{test_port\}"/);
  assert.match(controller, /IP_TYPE_CACHE_TTL/);
  assert.match(controller, /\.entries\[\$ip\]=\$type_result/);
  assert.match(controller, /api\.ipquery\.io/);
  assert.match(controller, /pinip\.net\/api\?format=json&ip=/);
  assert.match(controller, /ip_type:\(if \$risk\.is_datacenter then "datacenter" else "residential" end\)/);
});

test("RPC exposes the manual node type method as a write operation", () => {
  assert.match(rpcPlugin, /"node_ip_type_test": \{"id":""\}/);
  assert.match(rpcPlugin, /exec "\$CTL" node-ip-type-test "\$input"/);
  assert.match(acl, /"node_ip_type_test"/);
});

test("node table has one separate type column with green status badges", () => {
  assert.match(index, /<th>节点稳定性<\/th><th>类型<\/th><th>状态<\/th>/);
  assert.match(webApp, /function nodeIpTypeMarkup/);
  assert.match(webApp, /status-badge online/);
  assert.match(webApp, /检测类型/);
  assert.match(webApp, /node_ip_type_test/);
  assert.doesNotMatch(webApp, /干净度/);
  assert.doesNotMatch(webApp, /cleanliness/);
});
