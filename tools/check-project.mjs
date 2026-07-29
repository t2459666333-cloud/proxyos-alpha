import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  "README.md",
  "scripts/build-image.sh",
  "rootfs/etc/init.d/proxyos",
  "rootfs/etc/uci-defaults/99-proxyos",
  "rootfs/usr/libexec/proxyos/proxyosctl",
  "rootfs/usr/libexec/rpcd/proxyos",
  "rootfs/usr/share/rpcd/acl.d/proxyos.json",
  "rootfs/www/index.html",
  "rootfs/www/assets/app.css",
  "rootfs/www/assets/app.js",
  "rootfs/www/assets/proxyos-mark.svg",
  "rootfs/etc/proxyos/config-template.json",
  "rootfs/etc/proxyos/version",
];

for (const relative of required) {
  await access(path.join(root, relative), constants.R_OK);
}

for (const relative of [
  "package.json",
  "rootfs/etc/proxyos/nodes.json",
  "rootfs/etc/proxyos/devices.json",
  "rootfs/etc/proxyos/subscriptions.json",
  "rootfs/etc/proxyos/config-template.json",
  "rootfs/usr/share/rpcd/acl.d/proxyos.json",
]) {
  JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

const buildScript = await readFile(
  path.join(root, "scripts/build-image.sh"),
  "utf8",
);
for (const expected of [
  "25.12.5",
  "sing-box",
  "kmod-tun",
  "uhttpd-mod-ubus",
  "sha256sum --check",
  'PROXYOS_VERSION="$(tr -d',
]) {
  if (!buildScript.includes(expected)) {
    throw new Error(`build-image.sh is missing required value: ${expected}`);
  }
}

const template = JSON.parse(
  await readFile(
    path.join(root, "rootfs/etc/proxyos/config-template.json"),
    "utf8",
  ),
);
const tun = template.inbounds?.find((item) => item.type === "tun");
if (!tun?.auto_route || !tun?.auto_redirect) {
  throw new Error("TUN auto_route and auto_redirect must both be enabled");
}
if (tun.mtu > 1500) {
  throw new Error("TUN MTU must remain compatible with common Ethernet links");
}
const directDns = template.dns?.servers?.find((item) => item.tag === "dns-direct");
if (directDns?.type !== "local") {
  throw new Error("Bootstrap DNS must use the local resolver");
}
if (template.route?.default_domain_resolver !== "dns-direct") {
  throw new Error("The route bootstrap resolver must remain dns-direct");
}

const version = (await readFile(path.join(root, "VERSION"), "utf8")).trim();
const packagedVersion = (
  await readFile(path.join(root, "rootfs/etc/proxyos/version"), "utf8")
).trim();
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
if (version !== packagedVersion || version !== packageJson.version) {
  throw new Error("Project, package, and firmware versions must match");
}

for (const relative of [
  "rootfs/etc/proxyos/nodes.json",
  "rootfs/etc/proxyos/devices.json",
  "rootfs/etc/proxyos/subscriptions.json",
]) {
  const data = JSON.parse(await readFile(path.join(root, relative), "utf8"));
  if (!Array.isArray(data) || data.length !== 0) {
    throw new Error(`${relative} must be empty in a portable release image`);
  }
}

const firstBoot = await readFile(
  path.join(root, "rootfs/etc/uci-defaults/99-proxyos"),
  "utf8",
);
const controller = await readFile(
  path.join(root, "rootfs/usr/libexec/proxyos/proxyosctl"),
  "utf8",
);
for (const source of [firstBoot, controller]) {
  if (!source.includes('net_path}/phy80211')) {
    throw new Error("Physical-port detection must exclude Wi-Fi interfaces");
  }
}
if (!firstBoot.includes("6,192.168.10.1")) {
  throw new Error("DHCP must advertise ProxyOS as the LAN DNS server");
}
if (!firstBoot.includes("wifi config") || !firstBoot.includes(".disabled=1")) {
  throw new Error("First boot must detect radios and keep Wi-Fi disabled");
}

const indexHtml = await readFile(path.join(root, "rootfs/www/index.html"), "utf8");
const appScript = await readFile(path.join(root, "rootfs/www/assets/app.js"), "utf8");
const appStyles = await readFile(path.join(root, "rootfs/www/assets/app.css"), "utf8");
for (const requiredId of [
  "node-subscription-filter",
  "subscription-detail-modal",
  "subscription-detail-form",
  "subscription-detail-delete",
]) {
  if (!indexHtml.includes(`id="${requiredId}"`)) {
    throw new Error(`ProxyOS UI is missing required control: ${requiredId}`);
  }
}
if (!indexHtml.includes('href="/assets/proxyos-mark.svg')) {
  throw new Error("ProxyOS browser icon must use the product logo");
}
for (const requiredBehavior of [
  "groupedNodeOptions",
  "openSubscriptionDetails",
  "saveSubscriptionDetails",
  "subscription_get",
  "subscription_save",
  "scheduleEgressChecks",
  "egressByDevice",
  "reauthenticate",
  "latency_domestic_ms",
  "latency_foreign_ms",
]) {
  if (!appScript.includes(requiredBehavior)) {
    throw new Error(`ProxyOS UI is missing required behavior: ${requiredBehavior}`);
  }
}
if (!appScript.includes(version)) {
  throw new Error("ProxyOS UI fallback version does not match VERSION");
}
for (const requiredProbe of [
  "https://www.baidu.com/",
  "https://www.gstatic.com/generate_204",
]) {
  if (!controller.includes(requiredProbe)) {
    throw new Error(`Controller is missing required latency probe: ${requiredProbe}`);
  }
}
if (!controller.includes("latency_domestic_pid") || !controller.includes("latency_foreign_pid")) {
  throw new Error("Domestic and international latency probes must run in parallel");
}
if (!appStyles.includes(".egress-ip { display: inline;") || !appStyles.includes("font: inherit;")) {
  throw new Error("Exit IP must inherit the local-IP typography");
}

console.log(`ProxyOS project check passed (${required.length} required files).`);
process.exit(0);
