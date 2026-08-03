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
  assert.match(controller, /PROXYOS_EXTERNAL_CLIENT_ONLINE_GRACE:-10/);
  assert.match(controller, /activity_age" -le "\$EXTERNAL_CLIENT_ONLINE_GRACE"/);
  assert.match(watcher, /ageing_time 1000/);
  assert.match(watcher, /PROXYOS_LAN_SCAN_INTERVAL:-2/);
});

test("the dashboard refreshes presence within five seconds", () => {
  assert.match(ui, /}, 5000\);/);
});

test("device state is consistent across overview, device drawer and Wi-Fi page", () => {
  assert.match(ui, /function deviceStatus\(device\)[\s\S]*policy === "block"[\s\S]*\["blocked", "禁止"\][\s\S]*!device\.online[\s\S]*\["offline", "离线"\]/);
  assert.match(ui, /const allOnlineDevices = clientDevices\(\)\.filter\(\(device\) => device\.online\)/);
  assert.match(ui, /device\.online && \["fixed_node", "auto_node"\]\.includes\(device\.policy\)/);
  assert.doesNotMatch(ui, /class="button danger-outline wifi-block"/);
});
