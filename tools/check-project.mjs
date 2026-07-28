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

const indexHtml = await readFile(path.join(root, "rootfs/www/index.html"), "utf8");
const appScript = await readFile(path.join(root, "rootfs/www/assets/app.js"), "utf8");
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
]) {
  if (!appScript.includes(requiredBehavior)) {
    throw new Error(`ProxyOS UI is missing required behavior: ${requiredBehavior}`);
  }
}

console.log(`ProxyOS project check passed (${required.length} required files).`);
process.exit(0);
