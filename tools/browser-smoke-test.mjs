import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(
    process.env.PROXYOS_PLAYWRIGHT_MODULE ||
      resolve(import.meta.dirname, "../.tools-cache/pw/node_modules/playwright"),
  );
}
const { chromium } = playwright;

const router = process.env.PROXYOS_URL || "http://192.168.10.1/";
const password = process.env.PROXYOS_PASSWORD;
const browserPath =
  process.env.PROXYOS_BROWSER ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!password) {
  throw new Error("Set PROXYOS_PASSWORD before running the browser smoke test.");
}

const failures = [];
const checks = [];
const consoleErrors = [];
const requestFailures = [];
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`PAGEERROR: ${error.message}`));
page.on("requestfailed", (request) => {
  requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || "failed"}`);
});

async function check(name, action) {
  process.stdout.write(`[ui-smoke] ${name} ... `);
  try {
    const details = await action();
    checks.push({ name, ok: true, details: details ?? "" });
    process.stdout.write("ok\n");
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    checks.push({ name, ok: false, details: error.message });
    process.stdout.write(`failed: ${error.message}\n`);
  }
}

await check("login", async () => {
  const response = await page.goto(router, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
  await page.locator("#login-user").fill("root");
  await page.locator("#login-password").fill(password);
  await page.locator("#login-form button[type=submit]").click();
  await page.locator("#app-shell:not(.is-hidden)").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2_000);
  return await page.locator("#sidebar-version").innerText();
});

if (new URL(router).hostname === "127.0.0.1") {
  await check("expired-session-auto-recovery", async () => {
    const expired = await page.evaluate(async () => {
      const response = await fetch("/__expire_session", { method: "POST" });
      return response.status;
    });
    if (expired !== 200) throw new Error(`session expiry fixture returned ${expired}`);
    await page.locator(".refresh-button").first().click();
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("状态已更新"), null, { timeout: 10_000 });
    if (!(await page.locator("#login-screen").evaluate((element) => element.classList.contains("is-hidden")))) {
      throw new Error("UI returned to the login screen instead of reauthenticating");
    }
    return "session renewed without reloading the URL";
  });
}

for (const pageName of [
  "dashboard",
  "devices",
  "nodes",
  "subscriptions",
  "wifi",
  "policies",
  "network",
  "system",
]) {
  await check(`navigation:${pageName}`, async () => {
    await page.locator(`.nav-item[data-page="${pageName}"]`).click();
    const section = page.locator(`#page-${pageName}`);
    await section.waitFor({ state: "visible", timeout: 5_000 });
    if (!(await section.evaluate((element) => element.classList.contains("is-active")))) {
      throw new Error("page did not become active");
    }
    return (await section.locator("h1").first().innerText()).trim();
  });
}

await check("dashboard-data", async () => {
  await page.locator('.nav-item[data-page="dashboard"]').click();
  const metrics = await page.locator("#metric-grid .metric-card").count();
  const devices = await page.locator("#dashboard-device-body tr").count();
  if (metrics < 4) throw new Error(`expected 4 metrics, got ${metrics}`);
  await page.locator("#dashboard-device-body .more-button").first().click();
  await page.locator("#device-drawer:not(.is-hidden)").waitFor({ timeout: 5_000 });
  await page.locator("#device-drawer .close-layer").first().click();
  await page.screenshot({ path: resolve("work/ui-dashboard.png"), fullPage: true });
  return `${metrics} metrics, ${devices} table rows`;
});

await check("device-drawer-and-connection-tab", async () => {
  await page.locator('.nav-item[data-page="devices"]').click();
  const edit = page.locator("#page-devices .edit-device").first();
  await edit.waitFor({ state: "visible", timeout: 5_000 });
  await edit.click();
  await page.locator("#device-drawer:not(.is-hidden)").waitFor({ timeout: 5_000 });
  await page.locator('[data-drawer-tab="connection"]').click();
  const panel = page.locator('[data-drawer-panel="connection"]:not(.is-hidden)');
  await panel.waitFor({ timeout: 5_000 });
  const ip = (await page.locator("#drawer-info-ip").innerText()).trim();
  const mac = (await page.locator("#drawer-info-mac").innerText()).trim();
  if (!ip || ip === "—" || !mac || mac === "—") throw new Error("connection details are empty");
  const qualityDetails = await Promise.all([
    "#drawer-info-latency-domestic",
    "#drawer-info-latency-foreign",
    "#drawer-info-download",
    "#drawer-info-loss",
    "#drawer-info-stability",
  ].map(async (selector) => (await page.locator(selector).innerText()).trim()));
  if (qualityDetails.some((value) => !value || value === "—")) {
    throw new Error(`device quality details are incomplete: ${qualityDetails.join(" / ")}`);
  }
  await page.locator("#device-drawer .close-layer").first().click();
  const egressCell = page.locator("#page-devices .egress-ip").first();
  await egressCell.waitFor({ state: "visible", timeout: 5_000 });
  const localIpStyle = await page.locator("#device-table-body tr").first().locator("td").nth(3).evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
  });
  const egressIpStyle = await egressCell.evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
  });
  if (JSON.stringify(localIpStyle) !== JSON.stringify(egressIpStyle)) {
    throw new Error(`exit IP style differs from local IP: ${JSON.stringify({ localIpStyle, egressIpStyle })}`);
  }
  const latencyLines = await page.locator("#device-table-body tr").first().locator(".latency-line").allInnerTexts();
  if (!latencyLines.some((line) => line.includes("国内")) || !latencyLines.some((line) => line.includes("国外"))) {
    throw new Error(`dual latency values missing: ${latencyLines.join(" / ")}`);
  }
  await page.screenshot({ path: resolve("work/ui-devices.png"), fullPage: true });
  return `${ip}, ${mac}; ${latencyLines.join(" / ")}`;
});

await check("node-modal", async () => {
  await page.locator('.nav-item[data-page="nodes"]').click();
  await page.locator("#open-node-modal").click();
  await page.locator("#node-modal:not(.is-hidden)").waitFor({ timeout: 5_000 });
  const protocols = await page.locator("#node-protocol option").count();
  if (protocols < 10) throw new Error(`only ${protocols} protocols are present`);
  await page.locator("#node-modal .close-layer").first().click();
  const flags = await page.locator("#node-table-body .country-flag svg").count();
  if (flags < 1) throw new Error("SVG country flags were not rendered");
  const headers = await page.locator(".node-table thead th").allInnerTexts();
  for (const expected of ["国内 / 国外延迟", "实际下载速度", "丢包率", "节点稳定性"]) {
    if (!headers.includes(expected)) throw new Error(`node metric column is missing: ${expected}`);
  }
  const firstRowMetrics = await page.locator("#node-table-body tr").first().locator(".quality-value, .quality-badge").allInnerTexts();
  if (firstRowMetrics.length < 3) throw new Error(`node quality values are missing: ${firstRowMetrics.join(" / ")}`);
  const visibleRows = await page.locator("#node-table-body tr").count();
  if (visibleRows > 10) throw new Error(`pagination rendered ${visibleRows} rows on a 10-row page`);
  await page.screenshot({ path: resolve("work/ui-nodes.png"), fullPage: true });
  return `${protocols} protocol choices; ${visibleRows} paginated rows; ${firstRowMetrics.join(" / ")}`;
});

await check("node-device-picker", async () => {
  await page.locator('.nav-item[data-page="nodes"]').click();
  await page.locator("#node-table-body .assign-node").first().click();
  await page.locator("#assign-node-modal:not(.is-hidden)").waitFor({ timeout: 5_000 });
  const deviceCount = await page.locator("#assign-node-device-list .assign-device-option").count();
  if (deviceCount < 2) throw new Error(`expected all discovered devices, got ${deviceCount}`);
  await page.locator("#assign-node-select-all").check();
  const checkedCount = await page.locator("#assign-node-device-list .assign-device-check:checked").count();
  if (checkedCount !== deviceCount) throw new Error(`select all chose ${checkedCount} of ${deviceCount}`);
  await page.screenshot({ path: resolve("work/ui-node-device-picker.png"), fullPage: true });
  await page.locator("#assign-node-modal .close-layer").first().click();
  return `${deviceCount} selectable devices`;
});

await check("subscription-modal", async () => {
  await page.locator('.nav-item[data-page="subscriptions"]').click();
  const cards = await page.locator(".subscription-card").count();
  await page.locator("#open-subscription-modal").click();
  await page.locator("#subscription-modal:not(.is-hidden)").waitFor({ timeout: 5_000 });
  await page.locator("#subscription-modal .close-layer").first().click();
  return `${cards} subscriptions`;
});

await check("subscription-details-and-node-groups", async () => {
  await page.locator('.nav-item[data-page="subscriptions"]').click();
  await page.locator("#page-subscriptions .manage-subscription").first().click();
  await page.locator("#subscription-detail-modal:not(.is-hidden)").waitFor({ timeout: 5_000 });
  await page.waitForFunction(() => document.querySelector("#subscription-detail-name")?.value !== "正在读取…");
  const name = await page.locator("#subscription-detail-name").inputValue();
  const url = await page.locator("#subscription-detail-url").inputValue();
  if (!name || !url) throw new Error("subscription details are incomplete");
  await page.screenshot({ path: resolve("work/ui-subscriptions.png"), fullPage: true });
  await page.locator("#subscription-detail-modal .close-layer").first().click();

  await page.locator('.nav-item[data-page="devices"]').click();
  await page.locator("#page-devices .edit-device").first().click();
  const groupLabels = await page.locator("#drawer-node-select optgroup").evaluateAll((groups) =>
    groups.map((group) => group.label),
  );
  if (groupLabels.length < 2 || !groupLabels.some((label) => label.startsWith("订阅 ·"))) {
    throw new Error(`missing subscription groups: ${groupLabels.join(", ")}`);
  }
  await page.locator("#device-drawer .close-layer").first().click();
  return `${name}; ${groupLabels.join(" / ")}`;
});

await check("wifi-hardware-state", async () => {
  await page.locator('.nav-item[data-page="wifi"]').click();
  const text = await page.locator("#wifi-content").innerText();
  if (!/Wi|无线/.test(text)) throw new Error("Wi-Fi state was not rendered");
  return text.replace(/\s+/g, " ").slice(0, 100);
});

await check("policy-form", async () => {
  await page.locator('.nav-item[data-page="policies"]').click();
  await page.locator("#policy-settings-form").waitFor({ state: "visible", timeout: 5_000 });
  return await page.locator("#default-policy").inputValue();
});

await check("physical-ports", async () => {
  await page.locator('.nav-item[data-page="network"]').click();
  const ports = await page.locator(".port-card").count();
  if (ports < 2) throw new Error(`only ${ports} physical port(s) detected`);
  return `${ports} physical ports`;
});

await check("system-logs", async () => {
  await page.locator('.nav-item[data-page="system"]').click();
  await page.locator("#show-logs").click();
  const log = page.locator("#system-log-output:not(.is-hidden)");
  await log.waitFor({ timeout: 10_000 });
  const text = await log.innerText();
  if (!text.trim()) throw new Error("log output is empty");
  return `${text.length} log characters`;
});

await check("configuration-backup", async () => {
  await page.locator('.nav-item[data-page="system"]').click();
  const downloadEvent = page.waitForEvent("download", { timeout: 20_000 });
  await page.locator("#backup-download").click();
  const download = await downloadEvent;
  const failure = await download.failure();
  if (failure) throw new Error(failure);
  return download.suggestedFilename();
});

await check("apply-current-proxy-config", async () => {
  await page.locator("#apply-config").click();
  await page.locator("#apply-config:not([disabled])").waitFor({ timeout: 30_000 });
  const toast = await page.locator("#toast").innerText();
  if (!toast.includes("通过")) throw new Error(toast || "no success toast");
  return toast;
});

await page.screenshot({
  path: resolve("work/live-ui-smoke.png"),
  fullPage: true,
});

await browser.close();

const result = {
  ok: failures.length === 0 && consoleErrors.length === 0,
  checks,
  failures,
  consoleErrors,
  requestFailures,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
