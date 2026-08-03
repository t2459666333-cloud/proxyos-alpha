import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../rootfs/www/assets/app.js", import.meta.url), "utf8");
const match = appSource.match(/function isWifiDevice\(device\) \{[\s\S]*?function deviceIcon\(device\) \{[\s\S]*?\n\}/);

assert.ok(match, "isWifiDevice helper must exist in the bundled UI");

// Evaluate only the pure classification helper, without loading browser globals.
const helpers = Function(`"use strict"; ${match[0]}; return { isWifiDevice, isExternalAccessDevice, deviceIcon };`)();
const { isWifiDevice, isExternalAccessDevice, deviceIcon } = helpers;

test("local radio clients use the Wi-Fi icon", () => {
  assert.equal(isWifiDevice({ connection: "wifi", type: "phone" }), true);
  assert.equal(isWifiDevice({ connection: "wireless", type: "tablet" }), true);
  assert.equal(isWifiDevice({ connection: "wlan0", type: "client" }), true);
});

test("wired and downstream clients use the LAN icon", () => {
  assert.equal(isWifiDevice({ connection: "lan", type: "desktop" }), false);
  assert.equal(isWifiDevice({ connection: "external_ap_device", type: "access_point" }), false);
  assert.equal(isWifiDevice({ connection: "external_router_device", type: "router" }), false);
  assert.equal(isWifiDevice({ connection: "router_downstream", type: "wireless" }), false);
  assert.equal(isWifiDevice({ connection: "lan_bridge_downstream", type: "wifi" }), false);
});

test("clients behind an external AP or wireless router use the Wi-Fi icon", () => {
  assert.equal(isWifiDevice({ connection: "wifi_external_ap", type: "phone" }), true);
  assert.equal(isWifiDevice({ connection: "wifi_external_ap", type: "computer" }), true);
  assert.equal(isWifiDevice({ connection: "wifi_external_router", type: "computer" }), true);
  assert.equal(deviceIcon({ connection: "wifi_external_ap", type: "phone", name: "AP 无线终端" }), "smartphone");
});

test("AP and router infrastructure never use a computer icon", () => {
  assert.equal(deviceIcon({ connection: "external_ap_device", type: "external_client" }), "access-point");
  assert.equal(deviceIcon({ connection: "external_router_device", type: "external_client" }), "router");
});

test("unidentified external wireless clients use a neutral wireless icon", () => {
  assert.equal(deviceIcon({ connection: "wifi_external_ap", type: "downstream_device", name: "无线设备" }), "wifi");
  assert.equal(deviceIcon({ connection: "wifi_external_ap", type: "downstream_device", name: "OPPO-Reno5-Pro-5G" }), "smartphone");
});

test("all AP and downstream clients remain visible on the Wi-Fi management page", () => {
  assert.equal(isExternalAccessDevice({ connection: "wifi", type: "phone" }), true);
  assert.equal(isExternalAccessDevice({ connection: "external_ap_device", type: "access_point" }), true);
  assert.equal(isExternalAccessDevice({ connection: "external_router_device", type: "router" }), true);
  assert.equal(isExternalAccessDevice({ connection: "wifi_external_ap", type: "phone" }), true);
  assert.equal(isExternalAccessDevice({ connection: "wifi_external_router", type: "computer" }), true);
  assert.equal(isExternalAccessDevice({ connection: "router_downstream", type: "router" }), true);
  assert.equal(isExternalAccessDevice({ connection: "lan_bridge_downstream", type: "wifi" }), true);
  assert.equal(isExternalAccessDevice({ connection: "lan", type: "desktop" }), false);
});
