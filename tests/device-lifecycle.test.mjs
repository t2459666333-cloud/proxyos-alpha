import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controller = await readFile(new URL("../rootfs/usr/libexec/proxyos/proxyosctl", import.meta.url), "utf8");
const watcher = await readFile(new URL("../rootfs/usr/sbin/proxyos-watch-lan", import.meta.url), "utf8");
const ui = await readFile(new URL("../rootfs/www/assets/app.js", import.meta.url), "utf8");

test("offline profiles are hidden after seven days but policy records remain", () => {
  assert.match(controller, /604800/);
  assert.match(controller, /map\(select\(\.online == true or \(\$now - \(\.last_seen/);
  assert.doesNotMatch(controller, /del\(.*last_seen/);
});

test("locked external AP clients remain online during the presence grace period", () => {
  assert.match(watcher, /bridge -s fdb show/);
  assert.match(watcher, /probe_external_clients/);
  assert.match(watcher, /arping -q -f -c 3 -w 2 -I br-lan/);
  assert.match(watcher, /ping -q -c 2 -W 1 -I br-lan/);
  assert.match(watcher, /probe_count.*-lt 32/);
  assert.match(watcher, /requested grace period/);
  assert.match(watcher, /ARP_PRESENCE_FILE/);
  assert.match(watcher, /FILENAME == ARGV\[1\]/);
  assert.match(controller, /PROXYOS_EXTERNAL_CLIENT_ONLINE_GRACE:-60/);
  assert.match(controller, /activity_age" -le "\$EXTERNAL_CLIENT_ONLINE_GRACE"/);
  assert.match(watcher, /ageing_time 30000/);
  assert.match(watcher, /PROXYOS_LAN_SCAN_INTERVAL:-2/);
  assert.match(controller, /presence_source==\"arp_probe\" then \"observed\"/);
});

test("neighbour discovery cannot override connection-specific online state", () => {
  assert.match(controller, /Do not let neighbour reachability override the authoritative status/);
  assert.match(controller, /STALE entries still provide a useful current IP/);
  assert.match(controller, /\.status_source \/\/ ""/);
  assert.match(controller, /then \"carrier\" else \$presence_source end/);
  assert.match(controller, /status_source:\"carrier\"/);
  assert.match(controller, /status_source:\"hostapd\"/);
  assert.match(controller, /ubus call usteer get_clients/);
  assert.match(controller, /status_source:\"usteer\"/);
  assert.match(watcher, /lldp_port_role/);
});

test("remembered AP ports do not become direct LAN when the AP MAC is quiet", () => {
  assert.match(watcher, /Remember infrastructure identity/);
  assert.match(watcher, /KNOWN_AP_FILE.*\.tmp/);
  assert.match(watcher, /Preserve the remembered role while the physical link stays up/);
  assert.match(controller, /remembered_role[\s\S]*connection_type="wifi_external_ap"/);
  assert.match(controller, /device_type="\$\{device_role:-external_client\}"/);
  assert.match(controller, /keeping AP[\s\S]*status independent from the one-minute client activity rule/);
  assert.match(controller, /detection:"remembered-infrastructure",online:\$online/);
});

test("remembered infrastructure roles survive quiet periods but not device replacement", () => {
  assert.match(watcher, /remember_infrastructure/);
  assert.match(watcher, /explicit computer\/router evidence/);
  assert.match(watcher, /configured-router/);
  assert.match(controller, /remembered_role/);
  assert.match(controller, /wifi_external_router/);
  assert.match(controller, /remembered-infrastructure/);
  assert.match(watcher, /evidence="saved-profile"/);
  assert.match(watcher, /tmp_inferred/);
  assert.match(watcher, /remembered-infrastructure/);
});

test("new devices are classified from scored evidence instead of their LAN port", () => {
  assert.match(watcher, /refresh_mdns_identities/);
  assert.match(watcher, /ubus call umdns browse/);
  assert.match(watcher, /dhcp_type_for_mac/);
  assert.match(watcher, /neighbour_ipv4_for_mac/);
  assert.match(watcher, /IDENTITY_FILE/);
  assert.match(watcher, /remember_device_identity/);
  assert.match(watcher, /learned_identity_for_mac/);
  assert.match(controller, /identity_confidence/);
  assert.match(controller, /无线设备 ·/);
  assert.doesNotMatch(controller, /AP 无线终端 ·/);
});

test("the dashboard refreshes presence within five seconds", () => {
  assert.match(ui, /}, 5000\);/);
});

test("device state is consistent across overview, device drawer and Wi-Fi page", () => {
  assert.match(ui, /function deviceStatus\(device\)[\s\S]*policy === "block"[\s\S]*\["blocked", "禁止"\][\s\S]*!device\.online[\s\S]*\["offline", "离线"\]/);
  assert.match(ui, /const allOnlineDevices = clientDevices\(\)\.filter\(\(device\) => device\.online\)/);
  assert.match(ui, /device\.online && \["fixed_node", "auto_node"\]\.includes\(device\.policy\)/);
  assert.doesNotMatch(ui, /class="button danger-outline wifi-block"/);
  assert.match(controller, /\$live\.name[\s\S]*\$saved_device\.name/);
  assert.match(controller, /\.connection == "wifi_external_ap"[\s\S]*external_ap_device[\s\S]*\.ap_port=\$ports\[0\]/);
});
