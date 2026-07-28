const ZERO_SESSION = "00000000000000000000000000000000";

const state = {
  session: sessionStorage.getItem("proxyos_session") || "",
  page: "dashboard",
  status: {},
  devices: [],
  nodes: [],
  wifi: {},
  wifiConfig: { bands: [] },
  ports: [],
  subscriptions: [],
  policy: { default_policy: "direct", default_node_id: "" },
  selectedDevice: null,
  selectedDevices: new Set(),
  editingNode: "",
  nodeSource: "all",
  nodeHealth: "all",
  rollbackTimer: null,
  refreshTimer: null,
  loading: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const iconPaths = {
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-7h6v7"/>',
  monitor: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  wifi: '<path d="M4.9 9.1a10 10 0 0 1 14.2 0M2 6.2a14 14 0 0 1 20 0M8 12.2a5.7 5.7 0 0 1 8 0"/><circle cx="12" cy="17" r="1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v4M12 16h.01"/>',
  network: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-3h14v3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.52-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.05 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06L19.82 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.63.25 1.04.85 1.04 1.52V10.6H21v4h-.56A1.7 1.7 0 0 0 19.4 15Z"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4M4 4v5h5M4 13a8 8 0 0 0 14.8 4M20 20v-5h-5"/>',
  filter: '<path d="M4 5h16l-6 7v5l-4 2v-7Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  power: '<path d="M12 2v10M6.3 5.5a8 8 0 1 0 11.4 0"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>',
  laptop: '<rect x="4" y="4" width="16" height="12" rx="1"/><path d="M2 20h20l-2-4H4Z"/>',
  tv: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 22h8M12 18v4"/>',
  gamepad: '<path d="M7 8h10a4 4 0 0 1 3.6 5.8l-2.2 4.4a2 2 0 0 1-3.1.6L13.5 17h-3l-1.8 1.8a2 2 0 0 1-3.1-.6l-2.2-4.4A4 4 0 0 1 7 8Z"/><path d="M8 11v4M6 13h4M16 12h.01M18 14h.01"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  alertShield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 7v6M12 17h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 8V5M16 12h3M12 16v3M8 12H5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  pie: '<path d="M12 2v10h10A10 10 0 1 1 12 2Z"/><path d="M15 2.5A10 10 0 0 1 21.5 9H15Z"/>',
};

function iconMarkup(name) {
  const key = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[key] || iconPaths.globe}</svg>`;
}

function hydrateIcons(root = document) {
  $$("[data-icon]", root).forEach((element) => {
    if (!element.dataset.iconReady) {
      element.innerHTML = iconMarkup(element.dataset.icon);
      element.dataset.iconReady = "1";
    }
  });
}

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatUptime = (seconds = 0) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days ? `${days} 天 ` : ""}${hours} 小时 ${minutes} 分钟`;
};

const formatTime = (timestamp) => {
  if (!timestamp) return "尚未更新";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp * 1000));
};

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

async function ubusCall(object, method, payload = {}, session = state.session, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch("/ubus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "call", params: [session || ZERO_SESSION, object, method, payload] }),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("管理接口响应超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`管理接口返回 ${response.status}`);
  const envelope = await response.json();
  if (envelope.error) throw new Error(envelope.error.message || "RPC 请求失败");
  const [code, data] = envelope.result || [];
  if (code !== 0) {
    if (code === 6 || code === 9) throw new Error("登录已过期，请重新登录");
    throw new Error(data?.error || `RPC 错误 ${code}`);
  }
  if (data?.ok === false) throw new Error(data.error || "操作失败");
  return data ?? {};
}

const api = (method, payload = {}) =>
  ubusCall("proxyos", method, payload, state.session, method === "subscription_update" ? 45000 : 15000);
const unwrapItems = (value) => (Array.isArray(value?.items) ? value.items : Array.isArray(value) ? value : []);

async function login(username, password) {
  const result = await ubusCall("session", "login", { username, password }, ZERO_SESSION);
  if (!result.ubus_rpc_session) throw new Error("未获得登录会话");
  state.session = result.ubus_rpc_session;
  sessionStorage.setItem("proxyos_session", state.session);
  $("#login-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  await loadAll({ quiet: true });
  startRefreshLoop();
}

function logout() {
  state.session = "";
  state.loading = false;
  sessionStorage.removeItem("proxyos_session");
  $("#app-shell").classList.add("is-hidden");
  $("#login-screen").classList.remove("is-hidden");
  $("#login-password").value = "";
}

async function loadAll({ quiet = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const requests = [
    ["status", "status"],
    ["devices", "devices"],
    ["nodes", "nodes"],
    ["wifi", "wifi_status"],
    ["wifiConfig", "wifi_config"],
    ["ports", "ports"],
    ["subscriptions", "subscriptions"],
    ["policy", "policy_settings"],
  ];
  // rpcd launches one controller process per method. Serial reads avoid
  // exhausting a small router and make each refresh deterministic.
  const results = [];
  for (const [, method] of requests) {
    try {
      results.push({ status: "fulfilled", value: await api(method) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }
  let hadError = false;
  results.forEach((result, index) => {
    const [key] = requests[index];
    if (result.status === "fulfilled") state[key] = ["devices", "nodes", "ports", "subscriptions"].includes(key) ? unwrapItems(result.value) : result.value;
    else {
      hadError = true;
      if (String(result.reason?.message).includes("登录已过期")) logout();
      console.error(`${key}:`, result.reason);
    }
  });
  renderAll();
  state.loading = false;
  if (!quiet) showToast(hadError ? "部分状态读取失败" : "状态已更新", hadError);
}

function startRefreshLoop() {
  if (state.refreshTimer) return;
  state.refreshTimer = setInterval(() => {
    if (state.session) loadAll({ quiet: true });
  }, 15000);
}

function nodeFor(device) { return state.nodes.find((node) => node.id === device.node_id); }
function isWifiDevice(device) { return /wi.?fi|wireless|wlan/i.test(device.connection || device.type || ""); }
function deviceIcon(device) {
  const text = `${device.name || ""} ${device.vendor || ""}`.toLowerCase();
  if (/iphone|android|pixel|phone|手机/.test(text)) return "smartphone";
  if (/tv|电视/.test(text)) return "tv";
  if (/playstation|ps5|xbox|游戏/.test(text)) return "gamepad";
  if (/macbook|laptop|笔记本/.test(text)) return "laptop";
  return "monitor";
}
function platformFor(device) {
  const name = (device.name || "").toLowerCase();
  if (name.includes("iphone")) return "Apple / iOS";
  if (name.includes("mac")) return "Apple / macOS";
  if (name.includes("pixel") || name.includes("android")) return "Google / Android";
  if (name.includes("ps5") || name.includes("playstation")) return "Sony PlayStation";
  if (name.includes("tv") || name.includes("电视")) return "Smart TV";
  if (name.includes("desktop") || name.includes("windows")) return "Microsoft Windows";
  return device.mac || "未知平台";
}
function countryFor(node) {
  const text = `${node?.name || ""} ${node?.server || ""}`.toLowerCase();
  if (/香港|hong.?kong|\\bhk/.test(text)) return ["🇭🇰", "香港"];
  if (/美国|united.?states|\\bus/.test(text)) return ["🇺🇸", "美国"];
  if (/日本|japan|\\bjp/.test(text)) return ["🇯🇵", "日本"];
  if (/新加坡|singapore|\\bsg/.test(text)) return ["🇸🇬", "新加坡"];
  if (/德国|germany|\\bde/.test(text)) return ["🇩🇪", "德国"];
  if (/台湾|taiwan|\\btw/.test(text)) return ["🇹🇼", "台湾"];
  if (/英国|united.?kingdom|\\buk/.test(text)) return ["🇬🇧", "英国"];
  return ["🌐", "未知"];
}
function egressFor(device) {
  if (device.policy === "direct") return "本地直连";
  if (device.policy === "block") return "禁止联网";
  if (device.policy === "fixed_node") return nodeFor(device)?.name || "节点已失效";
  if (device.policy === "auto_node") return "自动选择";
  return "系统默认";
}
function policyLabel(policy) {
  return { fixed_node: "指定节点", auto_node: "自动节点组", direct: "直连", block: "禁止联网", system_default: "系统默认" }[policy] || "系统默认";
}
function deviceStatus(device) {
  if (device.policy === "block") return ["blocked", "已阻断"];
  if (device.policy === "direct") return ["direct", "直连"];
  return device.online ? ["online", "在线"] : ["offline", "离线"];
}
function latencyFor(device) { return nodeFor(device)?.latency_ms ?? null; }
function signalMarkup(latency) {
  if (latency == null) return "";
  return `<span class="signal-bars"><i></i><i></i><i></i></span>`;
}
function sparkPath(seed = 0) {
  const paths = [
    "M2 34 C19 33 24 22 40 24 S61 16 74 25 S94 14 110 17 S129 7 152 12 S172 4 198 9",
    "M2 34 C21 31 23 20 43 21 S63 14 77 23 S98 30 114 16 S132 26 145 18 S169 20 198 9",
    "M2 31 C18 34 25 20 42 18 S65 25 80 20 S98 32 113 19 S135 24 151 8 S171 28 198 11",
    "M2 29 C19 14 28 30 45 31 S64 4 82 12 S99 14 116 20 S134 13 151 24 S173 22 198 11",
  ];
  return paths[seed % paths.length];
}

function renderMetricCards() {
  const online = state.devices.filter((device) => device.online).length;
  const proxied = state.devices.filter((device) => ["fixed_node", "auto_node"].includes(device.policy)).length;
  const availableNodes = state.nodes.filter((node) => node.status !== "error").length;
  const abnormal = state.devices.filter((device) => device.policy === "fixed_node" && !nodeFor(device)).length;
  const metrics = [
    { color: "blue", icon: "monitor", label: "在线设备", value: online, sub: `总设备 ${state.devices.length} 台` },
    { color: "green", icon: "target", label: "代理设备", value: proxied, sub: `占比 ${state.devices.length ? ((proxied / state.devices.length) * 100).toFixed(1) : "0.0"}%` },
    { color: "violet", icon: "database", label: "可用节点", value: availableNodes, sub: `节点总数 ${state.nodes.length} 个` },
    { color: "red", icon: "alert-shield", label: "异常设备", value: abnormal, sub: `占比 ${state.devices.length ? ((abnormal / state.devices.length) * 100).toFixed(1) : "0.0"}%` },
  ];
  $("#metric-grid").innerHTML = metrics.map((item, index) => `
    <article class="metric-card ${item.color}">
      <div class="metric-main"><span class="metric-icon"><span class="icon" data-icon="${item.icon}"></span></span><div class="metric-copy"><span>${item.label}</span><strong>${item.value}</strong></div></div>
      <div class="metric-sub">${item.sub}</div>
      <div class="metric-spark"><svg viewBox="0 0 200 42" preserveAspectRatio="none"><path d="${sparkPath(index)}"/></svg></div>
    </article>`).join("");
}

function deviceRow(device, dashboard = false) {
  const node = nodeFor(device);
  const [statusClass, statusLabel] = deviceStatus(device);
  const latency = latencyFor(device);
  const [flag] = countryFor(node);
  const connection = isWifiDevice(device) ? "Wi‑Fi 5GHz" : "LAN";
  const protocol = device.policy === "direct" ? "DIRECT" : node?.protocol || (device.policy === "block" ? "Blocked" : "系统策略");
  if (dashboard) return `
    <tr>
      <td><div class="device-cell"><span class="device-avatar"><span class="icon" data-icon="${deviceIcon(device)}"></span></span><div><strong>${escapeHtml(device.name || "未知设备")}</strong><small>${escapeHtml(platformFor(device))}</small></div></div></td>
      <td>${escapeHtml(device.ip || "—")}</td>
      <td><div class="connection-cell ${isWifiDevice(device) ? "wifi" : "lan"}"><span class="icon" data-icon="${isWifiDevice(device) ? "wifi" : "network"}"></span><span>${connection}</span></div></td>
      <td><div class="node-cell"><span class="flag">${device.policy === "direct" ? "🌐" : device.policy === "block" ? "⛔" : flag}</span><div><strong>${escapeHtml(egressFor(device))}</strong><small>${escapeHtml(protocol)}</small></div></div></td>
      <td><span class="latency ${latency > 80 ? "warn" : ""}">${latency == null ? "—" : `${latency} ms`}${signalMarkup(latency)}</span></td>
      <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      <td><div class="table-actions"><button class="row-action edit-device" data-mac="${escapeHtml(device.mac)}"><span class="icon" data-icon="refresh"></span>更换节点</button><button class="row-action egress-check" data-mac="${escapeHtml(device.mac)}"><span class="icon" data-icon="target"></span>出口检测</button><button class="more-button">⋮</button></div></td>
    </tr>`;
  return `
    <tr class="${state.selectedDevices.has(device.mac) ? "is-selected" : ""}">
      <td><input class="device-row-checkbox" type="checkbox" data-mac="${escapeHtml(device.mac)}" ${state.selectedDevices.has(device.mac) ? "checked" : ""}/></td>
      <td><div class="device-cell"><span class="device-avatar"><span class="icon" data-icon="${deviceIcon(device)}"></span></span><div><strong>${escapeHtml(device.name || "未知设备")}</strong><small>${escapeHtml(platformFor(device))}</small></div></div></td>
      <td><div class="connection-cell ${isWifiDevice(device) ? "wifi" : "lan"}"><span class="icon" data-icon="${isWifiDevice(device) ? "wifi" : "network"}"></span><span>${connection}</span></div></td>
      <td>${escapeHtml(device.ip || "—")}</td>
      <td><div class="node-cell"><span class="flag">${device.policy === "direct" ? "🌐" : device.policy === "block" ? "⛔" : flag}</span><div><strong>${escapeHtml(egressFor(device))}</strong><small>${escapeHtml(node?.source_type === "subscription" ? "订阅节点" : node ? "手动节点" : policyLabel(device.policy))}</small></div></div></td>
      <td>${escapeHtml(protocol)}</td>
      <td><span class="latency ${latency > 80 ? "warn" : ""}">${latency == null ? "—" : `${latency} ms`}${signalMarkup(latency)}</span></td>
      <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      <td><button class="more-button edit-device" data-mac="${escapeHtml(device.mac)}">⋯</button></td>
    </tr>`;
}

function renderDashboard() {
  renderMetricCards();
  const wifi = state.wifi || {};
  $("#dashboard-wifi").innerHTML = `
    <div class="wifi-strip-main"><span class="wifi-orb"><span class="icon" data-icon="wifi"></span></span><div class="wifi-strip-copy"><h2>Wi‑Fi ${wifi.available ? (wifi.enabled ? "已开启" : "已关闭") : "功能不可用"}</h2><p>${wifi.available ? `检测到无线网卡${wifi.driver ? ` · ${escapeHtml(wifi.driver)}` : ""}` : escapeHtml(wifi.reason || "未检测到支持 AP 模式的无线网卡")}</p></div></div>
    <button id="dashboard-wifi-toggle" class="button wifi-power" ${wifi.available ? "" : "disabled"}><span class="icon" data-icon="power"></span>${wifi.enabled ? "一键关闭 Wi‑Fi" : "一键开启 Wi‑Fi"}</button>`;
  const onlineDevices = state.devices.filter((device) => device.online).slice(0, 5);
  $("#dashboard-device-body").innerHTML = onlineDevices.length ? onlineDevices.map((device) => deviceRow(device, true)).join("") : `<tr><td colspan="7"><div class="empty-state">等待局域网设备获取地址</div></td></tr>`;
  $("#dashboard-device-count").textContent = `共 ${state.devices.filter((device) => device.online).length} 台在线设备`;
  $("#dashboard-wifi-toggle")?.addEventListener("click", toggleWifi);
  bindDynamicDeviceActions();
}

function filteredDevices() {
  const query = ($("#device-search")?.value || "").trim().toLowerCase();
  const status = $("#device-status-filter")?.value || "all";
  const connection = $("#device-connection-filter")?.value || "all";
  return state.devices.filter((device) => {
    const textMatch = [device.name, device.ip, device.mac].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    const statusMatch = status === "all" || (status === "online" ? device.online : !device.online);
    const connectionMatch = connection === "all" || (connection === "wifi" ? isWifiDevice(device) : !isWifiDevice(device));
    return textMatch && statusMatch && connectionMatch;
  });
}

function renderDevices() {
  const devices = filteredDevices();
  $("#device-table-body").innerHTML = devices.length ? devices.map((device) => deviceRow(device)).join("") : `<tr><td colspan="9"><div class="empty-state">没有匹配的设备</div></td></tr>`;
  $("#device-count").textContent = `共 ${devices.length} 台设备`;
  $("#selected-device-count").textContent = `已选择 ${state.selectedDevices.size} 项`;
  $("#select-all-devices").checked = devices.length > 0 && devices.every((device) => state.selectedDevices.has(device.mac));
  bindDynamicDeviceActions();
  $$(".device-row-checkbox").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.selectedDevices.add(input.dataset.mac); else state.selectedDevices.delete(input.dataset.mac);
    renderDevices();
  }));
}

function bindDynamicDeviceActions() {
  hydrateIcons();
  $$(".edit-device").forEach((button) => button.addEventListener("click", () => openDeviceDrawer(button.dataset.mac)));
  $$(".egress-check").forEach((button) => button.addEventListener("click", () => checkEgress(button.dataset.mac)));
}

function renderNodeMetrics() {
  const available = state.nodes.filter((node) => node.status !== "error").length;
  const latencies = state.nodes.map((node) => Number(node.latency_ms)).filter((value) => value > 0);
  const average = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0;
  const protocols = new Map();
  state.nodes.forEach((node) => protocols.set(node.protocol, (protocols.get(node.protocol) || 0) + 1));
  const distribution = [...protocols.entries()].slice(0, 4);
  $("#node-metrics").innerHTML = `
    <article class="node-stat"><span class="node-stat-icon blue"><span class="icon" data-icon="database"></span></span><div class="node-stat-copy"><span>总节点数</span><strong>${state.nodes.length}</strong><small>手动与订阅节点</small></div></article>
    <article class="node-stat"><span class="node-stat-icon green"><span class="icon" data-icon="check-circle"></span></span><div class="node-stat-copy"><span>可用节点</span><strong>${available}</strong><small>可用率 ${state.nodes.length ? ((available / state.nodes.length) * 100).toFixed(1) : "0.0"}%</small></div></article>
    <article class="node-stat"><span class="node-stat-icon violet"><span class="icon" data-icon="zap"></span></span><div class="node-stat-copy"><span>平均延迟</span><strong>${average || "—"}${average ? " ms" : ""}</strong><small>基于最近一次测试</small></div></article>
    <article class="node-stat"><span class="node-stat-icon orange"><span class="icon" data-icon="pie"></span></span><div class="node-stat-copy"><span>协议分布</span><div class="protocol-mini">${distribution.length ? distribution.map(([name,count], index) => `<span><i style="background:${["#2f6bff","#2da860","#ee5b5b","#aeb8ca"][index]}"></i>${escapeHtml(name)}</span><strong>${count}</strong>`).join("") : "<small>暂无节点</small>"}</div></div></article>`;
}

function filteredNodes() {
  const query = ($("#node-search")?.value || "").trim().toLowerCase();
  const protocol = $("#node-protocol-filter")?.value || "all";
  return state.nodes.filter((node) => {
    const sourceMatch = state.nodeSource === "all" || node.source_type === state.nodeSource;
    const healthMatch = state.nodeHealth === "all" || (state.nodeHealth === "available" ? node.status !== "error" : node.status === "error");
    const protocolMatch = protocol === "all" || node.protocol === protocol;
    const queryMatch = [node.name, node.server, node.protocol].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    return sourceMatch && healthMatch && protocolMatch && queryMatch;
  });
}

function renderNodes() {
  renderNodeMetrics();
  const nodes = filteredNodes();
  $("#node-table-body").innerHTML = nodes.length ? nodes.map((node) => {
    const [flag, country] = countryFor(node);
    const latency = node.latency_ms;
    return `<tr>
      <td><div class="node-name"><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(node.server || "服务器地址已保护")}</small></div></td>
      <td><span class="source-label">${node.source_type === "subscription" ? "订阅" : "手动"}</span></td>
      <td><span class="flag">${flag}</span> ${country}</td>
      <td><span class="protocol-pill">${escapeHtml(node.protocol)}</span></td>
      <td><span class="latency ${latency > 80 ? "warn" : ""}">${latency == null ? "—" : `${latency} ms`}</span></td>
      <td><span class="status-badge ${node.status === "error" ? "blocked" : "online"}">${node.status === "error" ? "异常" : "可用"}</span></td>
      <td><div class="node-actions"><button class="text-action edit-node" data-id="${escapeHtml(node.id)}">编辑</button><button class="text-action test-node" data-id="${escapeHtml(node.id)}">测速</button><button class="text-action assign-node" data-id="${escapeHtml(node.id)}">分配设备</button><button class="more-button delete-node" data-id="${escapeHtml(node.id)}">⋮</button></div></td>
    </tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty-state">节点库为空，请添加手动节点或订阅。</div></td></tr>`;
  $("#node-count").textContent = `共 ${nodes.length} 条`;
  hydrateIcons();
  $$(".delete-node").forEach((button) => button.addEventListener("click", () => deleteNode(button.dataset.id)));
  $$(".test-node").forEach((button) => button.addEventListener("click", () => testNode(button)));
  $$(".assign-node").forEach((button) => button.addEventListener("click", () => assignNode(button.dataset.id)));
  $$(".edit-node").forEach((button) => button.addEventListener("click", () => openNodeModal(button.dataset.id)));
}

function renderSubscriptions() {
  $("#subscription-grid").innerHTML = state.subscriptions.length ? state.subscriptions.map((subscription) => `
    <article class="panel subscription-card" title="${escapeHtml(subscription.error || "")}">
      <div class="subscription-card-head"><span class="source-pill">${escapeHtml((subscription.format || "自动识别").toUpperCase())}</span><button class="more-button delete-subscription" data-id="${escapeHtml(subscription.id)}">⋮</button></div>
      <h3>${escapeHtml(subscription.name)}</h3>
      <p>${Number(subscription.node_count || 0)} 个节点 · 最后更新：${escapeHtml(formatTime(subscription.last_update))}</p>
      <div class="subscription-foot"><span class="status-badge ${subscription.status === "ok" ? "online" : "offline"}">${subscription.status === "ok" ? "正常" : subscription.status === "error" ? "更新失败" : "等待更新"}</span><button class="button button-soft update-subscription" data-id="${escapeHtml(subscription.id)}">立即更新</button></div>
    </article>`).join("") : `<article class="panel empty-state">还没有订阅，可添加 Clash YAML、Base64、分享链接或 sing-box JSON 订阅。</article>`;
  $$(".update-subscription").forEach((button) => button.addEventListener("click", () => updateSubscription(button)));
  $$(".delete-subscription").forEach((button) => button.addEventListener("click", () => deleteSubscription(button.dataset.id)));
}

function renderWifi() {
  const wifi = state.wifi || {};
  if (!wifi.available) {
    $("#wifi-content").innerHTML = `<article class="panel wifi-unavailable"><span class="wifi-orb"><span class="icon" data-icon="wifi"></span></span><h2>Wi‑Fi 功能不可用</h2><p>${escapeHtml(wifi.reason || "未检测到支持 AP 模式的无线网卡。")} 通过外部 AP 接入的设备仍可在设备页面单独分配代理节点，但本机无法控制外部 AP 的无线开关。</p><button class="button button-ghost" disabled>一键开关不可用</button></article>`;
    hydrateIcons();
    return;
  }
  const bands = state.wifiConfig?.bands || [];
  const band24 = bands.find((band) => String(band.band).startsWith("2")) || {};
  const band5 = bands.find((band) => String(band.band).startsWith("5")) || {};
  const driver = escapeHtml(wifi.driver || wifi.phy || "无线网卡");
  $("#wifi-content").innerHTML = `
    <article class="wifi-strip wifi-page-hero"><div class="wifi-strip-main"><span class="wifi-orb"><span class="icon" data-icon="wifi"></span></span><div class="wifi-strip-copy"><h2>Wi‑Fi ${wifi.enabled ? "已开启" : "已关闭"} <span class="enabled-pill">${wifi.enabled ? "正常" : "已停用"}</span></h2><p>检测到无线网卡 · ${driver}</p></div></div><button id="wifi-toggle" class="button wifi-power"><span class="icon" data-icon="power"></span>${wifi.enabled ? "一键关闭 Wi‑Fi" : "一键开启 Wi‑Fi"}</button></article>
    <div class="wifi-band-grid">
      ${wifiBandCard("2.4GHz 网络", band24, wifi.enabled)}
      ${wifiBandCard("5GHz 网络", band5, wifi.enabled)}
    </div>
    <article class="panel wifi-settings">
      <div class="section-title-row"><h2>无线设置</h2><button form="wifi-settings-form" class="button button-primary" type="submit">保存无线设置</button></div>
      <form class="wifi-form" id="wifi-settings-form">
      <label class="wifi-field"><span>2.4GHz SSID</span><input id="wifi-ssid-24" value="${escapeHtml(band24.ssid || "ProxyOS-2.4G")}" /></label>
      <label class="wifi-field inline-button"><span>密码</span><input id="wifi-password" type="password" autocomplete="new-password" placeholder="留空则保持原密码" /><button id="wifi-password-toggle" type="button" class="button button-soft">显示</button></label>
      <label class="wifi-field"><span>5GHz SSID</span><input id="wifi-ssid-5" value="${escapeHtml(band5.ssid || "ProxyOS-5G")}" /></label>
      <label class="wifi-field"><span>信道宽度</span><select id="wifi-width"><option value="balanced">2.4GHz: 20/40 MHz · 5GHz: 80 MHz</option><option value="compatibility">兼容模式：20 MHz · 40 MHz</option></select></label>
      <label class="wifi-field"><span>安全模式</span><select id="wifi-encryption"><option value="sae-mixed">WPA2/WPA3-Personal（推荐）</option><option value="psk2">WPA2-Personal</option><option value="sae">WPA3-Personal</option></select></label>
      <label class="wifi-field"><span>发射功率</span><select id="wifi-txpower"><option value="">自动</option><option value="20">高</option><option value="14">中</option><option value="8">低</option></select></label>
      <label class="wifi-field"><span>Wi‑Fi 国家/地区</span><select id="wifi-country"><option value="CN">中国 (CN)</option><option value="US">美国 (US)</option><option value="JP">日本 (JP)</option><option value="SG">新加坡 (SG)</option></select></label>
      <div class="wifi-field"><span>访客 Wi‑Fi</span><div class="switch-line"><label class="toggle-switch"><input id="wifi-guest" type="checkbox" ${state.wifiConfig?.guest_enabled ? "checked" : ""} /><i></i></label><span>启用独立网段与客户端隔离</span></div></div>
    </form></article>
    <article class="panel wifi-clients"><div class="panel-head"><h2>已连接的无线设备</h2><button id="wifi-refresh" class="button button-ghost"><span class="icon" data-icon="refresh"></span>刷新</button></div><div class="table-wrap"><table class="data-table wifi-client-table"><thead><tr><th>设备名称</th><th>信号强度</th><th>频段</th><th>IP 地址</th><th>分配节点</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.devices.filter(isWifiDevice).map((device) => `<tr><td><div class="device-cell"><span class="device-avatar"><span class="icon" data-icon="${deviceIcon(device)}"></span></span><strong>${escapeHtml(device.name || "未知设备")}</strong></div></td><td><span class="latency">${device.signal != null ? `${device.signal} dBm` : "— dBm"}</span></td><td>${escapeHtml(device.band || "Wi‑Fi")}</td><td>${escapeHtml(device.ip || "—")}</td><td>${escapeHtml(egressFor(device))}</td><td><span class="status-badge online">在线</span></td><td><button class="button danger-outline wifi-disconnect" data-mac="${escapeHtml(device.mac)}">断开连接</button></td></tr>`).join("") || `<tr><td colspan="7"><div class="empty-state">没有检测到无线客户端</div></td></tr>`}</tbody></table></div></article>`;
  hydrateIcons();
  $("#wifi-toggle")?.addEventListener("click", toggleWifi);
  $("#wifi-settings-form")?.addEventListener("submit", saveWifiSettings);
  $("#wifi-refresh")?.addEventListener("click", () => loadAll());
  $("#wifi-password-toggle")?.addEventListener("click", () => {
    const input = $("#wifi-password");
    input.type = input.type === "password" ? "text" : "password";
  });
  $$(".wifi-disconnect").forEach((button) => button.addEventListener("click", () => disconnectWifiClient(button.dataset.mac)));
}

function wifiBandCard(title, band, enabled) {
  const active = enabled && band.enabled !== false;
  return `<article class="panel wifi-band-card"><div class="wifi-band-head"><span class="wifi-band-icon"><span class="icon" data-icon="wifi"></span></span><div class="wifi-band-content"><div class="wifi-band-title"><h2>${title}</h2><span class="enabled-pill">${active ? "已启用" : "已停用"}</span></div><dl class="wifi-facts"><div><dt>SSID</dt><dd>${escapeHtml(band.ssid || "未配置")}</dd></div><div><dt>安全模式</dt><dd>${escapeHtml(band.encryption || "WPA2/WPA3-Personal")}</dd></div><div><dt>信道</dt><dd>${escapeHtml(band.channel || "自动")}</dd></div><div><dt>信道宽度</dt><dd>${escapeHtml(band.htmode || "自动")}</dd></div><div><dt>已连接设备</dt><dd>${state.devices.filter(isWifiDevice).length} 台</dd></div><div><dt>状态</dt><dd><span class="enabled-pill">${active ? "正常" : "已停用"}</span></dd></div></dl></div></div></article>`;
}

function renderPorts() {
  $("#port-grid").innerHTML = state.ports.length ? state.ports.map((port, index) => `
    <article class="panel port-card" data-port="${escapeHtml(port.name)}"><div class="port-card-top"><span class="node-stat-icon blue"><span class="icon" data-icon="network"></span></span><span class="status-badge ${port.state === "up" ? "online" : "offline"}">${port.state === "up" ? "已连接" : "未连接"}</span></div><h3>网口 ${index + 1} · ${escapeHtml(port.name)}</h3><p>${escapeHtml(port.driver || "未知驱动")} · ${port.speed_mbps > 0 ? `${port.speed_mbps} Mbps` : "速度未知"}<br/>${escapeHtml(port.mac)}</p><select class="port-role"><option value="wan" ${port.role === "wan" ? "selected" : ""}>WAN</option><option value="lan" ${port.role === "lan" ? "selected" : ""}>LAN</option><option value="unused" ${port.role === "unused" ? "selected" : ""}>未使用</option></select></article>`).join("") : `<article class="panel empty-state">没有检测到物理以太网接口</article>`;
  hydrateIcons();
}

function renderPolicies() {
  const page = $("#page-policies");
  let panel = $("#policy-settings-panel");
  if (!panel) {
    panel = document.createElement("article");
    panel.id = "policy-settings-panel";
    panel.className = "panel policy-settings-panel";
    $(".policy-grid", page).after(panel);
  }
  const options = state.nodes.map((node) => `<option value="${escapeHtml(node.id)}" ${state.policy.default_node_id === node.id ? "selected" : ""}>${escapeHtml(node.name)} · ${escapeHtml(node.protocol)}</option>`).join("");
  panel.innerHTML = `
    <div class="section-title-row"><div><h2>系统默认出口</h2><p>未单独设置的设备使用此策略</p></div><button form="policy-settings-form" class="button button-primary" type="submit">保存策略</button></div>
    <form id="policy-settings-form" class="settings-form-row">
      <label>默认策略<select id="default-policy"><option value="direct" ${state.policy.default_policy === "direct" ? "selected" : ""}>完全直连</option><option value="fixed_node" ${state.policy.default_policy === "fixed_node" ? "selected" : ""}>指定节点</option><option value="block" ${state.policy.default_policy === "block" ? "selected" : ""}>禁止联网</option></select></label>
      <label>默认节点<select id="default-node" ${state.policy.default_policy === "fixed_node" ? "" : "disabled"}><option value="">请选择节点</option>${options}</select></label>
      <div class="policy-safety"><span class="status-badge online">防泄漏已启用</span><small>节点失效时按设备设置处理；未配置回退时保持断网。</small></div>
    </form>`;
  $("#default-policy").addEventListener("change", (event) => { $("#default-node").disabled = event.target.value !== "fixed_node"; });
  $("#policy-settings-form").addEventListener("submit", savePolicySettings);
}

function renderSystem() {
  const healthy = Boolean(state.status.singbox_running);
  $("#system-version").textContent = state.status.version || "0.2.1-alpha";
  $("#system-model").textContent = state.status.model || "x86-64";
  $("#system-kernel").textContent = state.status.kernel || "—";
  $("#system-core").textContent = healthy ? "运行正常" : "未运行";
  $("#sidebar-core-text").textContent = healthy ? "系统运行正常" : "代理核心异常";
  $("#sidebar-uptime").textContent = formatUptime(state.status.uptime);
  $("#sidebar-version").textContent = state.status.version || "0.2.1-alpha";
  $("#sidebar-kernel").textContent = state.status.kernel || "—";
  ["#global-health", "#system-health-pill"].forEach((selector) => {
    const pill = $(selector);
    if (!pill) return;
    pill.classList.toggle("is-error", !healthy);
    pill.lastChild.textContent = healthy ? "系统运行正常" : "代理核心异常";
  });
  let maintenance = $("#system-maintenance");
  if (!maintenance) {
    maintenance = document.createElement("article");
    maintenance.id = "system-maintenance";
    maintenance.className = "panel settings-card system-maintenance";
    $(".system-grid").append(maintenance);
  }
  maintenance.innerHTML = `
    <h2>配置与维护</h2>
    <div class="maintenance-actions">
      <button id="backup-download" class="button button-soft">下载配置备份</button>
      <label class="button button-soft file-button">恢复配置<input id="backup-upload" type="file" accept=".gz,.tgz,.tar.gz" /></label>
      <button id="show-logs" class="button button-soft">查看运行日志</button>
      <button id="system-reboot" class="button danger-outline">重启系统</button>
    </div>
    <form id="password-form" class="password-form"><label>新管理员密码<input id="new-password" type="password" minlength="8" autocomplete="new-password" placeholder="至少 8 个字符" /></label><button class="button button-primary" type="submit">修改密码</button></form>
    <pre id="system-log-output" class="system-log is-hidden"></pre>`;
  $("#backup-download").addEventListener("click", createBackup);
  $("#backup-upload").addEventListener("change", restoreBackup);
  $("#show-logs").addEventListener("click", showSystemLogs);
  $("#system-reboot").addEventListener("click", rebootSystem);
  $("#password-form").addEventListener("submit", setAdminPassword);
}

function renderAll() {
  renderDashboard();
  renderDevices();
  renderNodes();
  renderSubscriptions();
  renderWifi();
  renderPorts();
  renderPolicies();
  renderSystem();
  hydrateIcons();
}

function setPage(page) {
  state.page = page;
  $$(".page").forEach((section) => section.classList.toggle("is-active", section.id === `page-${page}`));
  $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.page === page));
  $(".sidebar").classList.remove("is-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openDeviceDrawer(mac) {
  const device = state.devices.find((item) => item.mac === mac);
  if (!device) return;
  state.selectedDevice = device;
  $("#drawer-device-name").textContent = device.name || "未知设备";
  $("#drawer-device-platform").textContent = platformFor(device);
  $("#drawer-device-line").textContent = `${device.ip || "—"} · ${isWifiDevice(device) ? "Wi‑Fi" : "LAN"}`;
  $(".drawer-device-title .device-avatar").innerHTML = `<span class="icon" data-icon="${deviceIcon(device)}"></span>`;
  const policy = device.policy || "system_default";
  const radio = $(`#device-policy-form input[value="${policy}"]`);
  if (radio) radio.checked = true;
  const options = state.nodes.length ? state.nodes.map((node) => `<option value="${escapeHtml(node.id)}" ${device.node_id === node.id ? "selected" : ""}>${escapeHtml(node.name)} · ${escapeHtml(node.protocol)}</option>`).join("") : `<option value="">没有可用节点</option>`;
  $("#drawer-node-select").innerHTML = options;
  $("#drawer-backup-select").innerHTML = `<option value="">未设置备用节点</option>${state.nodes.map((node) => `<option value="${escapeHtml(node.id)}" ${device.backup_node_id === node.id ? "selected" : ""}>${escapeHtml(node.name)} · ${escapeHtml(node.protocol)}</option>`).join("")}`;
  $("#drawer-failure-mode").value = device.failure_mode || "block";
  $$("#device-drawer .tab-group button").forEach((button) => button.classList.toggle("is-active", button.dataset.value === (device.auto_source || "all")));
  syncDrawerNodeState();
  $("#device-drawer").classList.remove("is-hidden");
  hydrateIcons($("#device-drawer"));
}

function closeLayers() { $$(".drawer-backdrop, .modal-backdrop").forEach((layer) => layer.classList.add("is-hidden")); }
function syncDrawerNodeState() {
  const policy = $("#device-policy-form input[name=policy]:checked")?.value;
  $("#drawer-node-select").disabled = policy !== "fixed_node";
  $("#drawer-backup-select").disabled = !["fixed_node", "auto_node"].includes(policy);
  $("#drawer-failure-mode").disabled = !["fixed_node", "auto_node"].includes(policy);
}

async function saveDevicePolicy(event) {
  event.preventDefault();
  const device = state.selectedDevice;
  if (!device) return;
  const policy = $("#device-policy-form input[name=policy]:checked")?.value || "system_default";
  const nodeId = $("#drawer-node-select").value;
  const backupNodeId = $("#drawer-backup-select").value;
  const failureMode = $("#drawer-failure-mode").value;
  const autoSource = $("#device-drawer .tab-group button.is-active")?.dataset.value || "all";
  if (policy === "fixed_node" && !nodeId) return showToast("请先添加并选择一个节点", true);
  if (policy === "auto_node" && !state.nodes.length) return showToast("自动节点组中没有可用节点", true);
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "正在保存…";
  try {
    await api("device_bind", {
      mac: device.mac,
      ip: device.ip,
      name: device.name || "Unknown device",
      policy,
      node_id: policy === "fixed_node" ? nodeId : "",
      backup_node_id: backupNodeId,
      failure_mode: failureMode,
      auto_source: autoSource,
    });
    closeLayers();
    await loadAll({ quiet: true });
    showToast("设备出口已更新");
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; button.textContent = "保存设置"; }
}

function protocolOutbound() {
  const protocol = $("#node-protocol").value;
  if (protocol === "raw") return JSON.parse($("#node-raw-json").value);
  const server = $("#node-server").value.trim();
  const serverPort = Number($("#node-port").value);
  const identity = $("#node-identity").value.trim();
  const secret = $("#node-secret").value;
  if (!server || !serverPort) throw new Error("服务器与端口不能为空");
  const outbound = { type: protocol, server, server_port: serverPort };
  if (protocol === "vless") outbound.uuid = identity;
  if (protocol === "vmess") Object.assign(outbound, { uuid: identity, security: "auto" });
  if (["trojan", "hysteria2", "anytls"].includes(protocol)) outbound.password = secret;
  if (protocol === "hysteria") Object.assign(outbound, { auth_str: secret, up_mbps: 100, down_mbps: 100 });
  if (protocol === "tuic") Object.assign(outbound, { uuid: identity, password: secret });
  if (protocol === "shadowsocks") Object.assign(outbound, { method: identity || "2022-blake3-aes-128-gcm", password: secret });
  if (["socks", "http", "ssh"].includes(protocol)) {
    if (identity) outbound.username = identity;
    if (secret) outbound.password = secret;
  }
  if (protocol === "wireguard") Object.assign(outbound, { private_key: identity, peer_public_key: secret, local_address: ["172.19.10.2/32"] });
  const transport = $("#node-transport").value;
  if (transport && ["vless", "vmess", "trojan"].includes(protocol)) outbound.transport = { type: transport };
  if ($("#node-tls-select").value === "true" && ["vless", "vmess", "trojan", "hysteria", "hysteria2", "tuic", "anytls"].includes(protocol)) outbound.tls = { enabled: true, server_name: server };
  return outbound;
}

async function openNodeModal(id = "") {
  const form = $("#node-form");
  form.reset();
  state.editingNode = id;
  $(".node-modal .modal-head h2").textContent = id ? "编辑节点" : "添加节点";
  if (id) {
    try {
      const node = await api("node_get", { id });
      $("#node-name").value = node.name || "";
      $("#node-protocol").value = "raw";
      $("#node-raw-json").value = JSON.stringify(JSON.parse(node.outbound_json), null, 2);
    } catch (error) {
      showToast(error.message, true);
      state.editingNode = "";
      return;
    }
  }
  syncNodeProtocolFields();
  $("#node-modal").classList.remove("is-hidden");
}

async function addNode(event) {
  event.preventDefault();
  const button = event.submitter;
  try {
    const outbound = protocolOutbound();
    button.disabled = true;
    button.textContent = "正在检查…";
    const payload = { name: $("#node-name").value.trim(), outbound_json: JSON.stringify(outbound) };
    if (state.editingNode) await api("node_update", { id: state.editingNode, ...payload });
    else await api("node_add", payload);
    event.target.reset();
    state.editingNode = "";
    closeLayers();
    await loadAll({ quiet: true });
    showToast("节点已保存并通过配置检查");
  } catch (error) { showToast(`节点未保存：${error.message}`, true); }
  finally { button.disabled = false; button.textContent = "保存"; }
}

async function deleteNode(id) {
  if (!window.confirm("删除节点后，绑定它的设备将保持断网。是否继续？")) return;
  try { await api("node_delete", { id }); await loadAll({ quiet: true }); showToast("节点已删除"); }
  catch (error) { showToast(error.message, true); }
}
function syncNodeProtocolFields() {
  const raw = $("#node-protocol").value === "raw";
  $$(".standard-node-field").forEach((field) => field.classList.toggle("is-hidden", raw));
  $("#tls-field").classList.toggle("is-hidden", raw);
  $("#raw-json-field").classList.toggle("is-hidden", !raw);
}
async function testNode(button) {
  button.disabled = true;
  const old = button.textContent;
  button.textContent = "测试中";
  try {
    const result = await api("node_test", { id: button.dataset.id });
    showToast(result.latency_ms != null ? `节点延迟 ${result.latency_ms} ms` : "节点连接测试完成");
    await loadAll({ quiet: true });
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; button.textContent = old; }
}
function assignNode(id) {
  const device = state.devices.find((item) => item.online) || state.devices[0];
  if (!device) return showToast("当前没有可分配的设备", true);
  openDeviceDrawer(device.mac);
  $("#device-policy-form input[value=fixed_node]").checked = true;
  $("#drawer-node-select").value = id;
  syncDrawerNodeState();
}

async function addSubscription(event) {
  event.preventDefault();
  const button = event.submitter;
  try {
    button.disabled = true;
    await api("subscription_add", { name: $("#subscription-name").value.trim(), url: $("#subscription-url").value.trim() });
    event.target.reset(); closeLayers(); await loadAll({ quiet: true }); showToast("订阅已保存，请点击立即更新");
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
}
async function updateSubscription(button) {
  button.disabled = true; button.textContent = "更新中…";
  try { await api("subscription_update", { id: button.dataset.id }); await loadAll({ quiet: true }); showToast("订阅已更新"); }
  catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; button.textContent = "立即更新"; }
}

async function deleteSubscription(id) {
  if (!window.confirm("删除订阅会同时移除该订阅的节点，相关设备将按失效策略处理。是否继续？")) return;
  try {
    await api("subscription_delete", { id });
    await loadAll({ quiet: true });
    showToast("订阅已删除");
  } catch (error) { showToast(error.message, true); }
}

async function toggleWifi(event) {
  const button = event.currentTarget;
  if (!state.wifi.available) return;
  button.disabled = true;
  try {
    await api("wifi_toggle", { enabled: !state.wifi.enabled });
    state.wifi = await api("wifi_status");
    renderDashboard(); renderWifi(); showToast(state.wifi.enabled ? "Wi‑Fi 已开启" : "Wi‑Fi 已关闭");
  } catch (error) { showToast(error.message, true); }
  finally { if (button.isConnected) button.disabled = false; }
}

async function saveWifiSettings(event) {
  event.preventDefault();
  const button = event.submitter;
  const width = $("#wifi-width").value;
  button.disabled = true;
  button.textContent = "正在保存…";
  try {
    await api("wifi_apply", {
      ssid_24: $("#wifi-ssid-24").value.trim(),
      ssid_5: $("#wifi-ssid-5").value.trim(),
      password: $("#wifi-password").value,
      country: $("#wifi-country").value,
      encryption: $("#wifi-encryption").value,
      txpower: $("#wifi-txpower").value ? Number($("#wifi-txpower").value) : 0,
      channel_24: "auto",
      channel_5: "auto",
      htmode_24: width === "compatibility" ? "HT20" : "HE40",
      htmode_5: width === "compatibility" ? "VHT40" : "HE80",
      guest_enabled: $("#wifi-guest").checked,
    });
    await loadAll({ quiet: true });
    showToast("无线设置已保存");
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; button.textContent = "保存无线设置"; }
}

async function disconnectWifiClient(mac) {
  if (!window.confirm("确认断开该无线设备？设备稍后仍可重新连接。")) return;
  try {
    await api("wifi_disconnect", { mac });
    await loadAll({ quiet: true });
    showToast("无线设备已断开");
  } catch (error) { showToast(error.message, true); }
}

async function checkEgress(mac) {
  const device = state.devices.find((item) => item.mac === mac);
  if (!device) return;
  try {
    const result = await api("egress_check", { device_mac: mac });
    if (result.blocked) {
      showToast(`${device.name || "设备"} 当前策略为断网保护，没有公网出口`);
      return;
    }
    showToast(result.ip ? `${device.name || "设备"} 出口 IP：${result.ip}` : "出口检测未获得公网 IP", !result.ip);
  } catch (error) { showToast(`出口检测失败：${error.message}`, true); }
}

async function savePolicySettings(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await api("policy_apply", { default_policy: $("#default-policy").value, default_node_id: $("#default-node").value });
    state.policy = await api("policy_settings");
    renderPolicies();
    showToast("系统默认策略已保存");
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
}

function downloadBase64(filename, base64Data) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/gzip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function createBackup() {
  const button = $("#backup-download");
  button.disabled = true;
  try {
    const result = await api("backup_create");
    if (!result.data_base64) throw new Error("备份数据为空，未下载文件");
    downloadBase64(result.filename, result.data_base64);
    showToast("配置备份已生成");
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
}

async function restoreBackup(event) {
  const file = event.target.files?.[0];
  if (!file || !window.confirm("恢复配置后建议重启，网络设置也可能改变。是否继续？")) return;
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await api("backup_restore", { data_base64: String(dataUrl).split(",", 2)[1] });
    await loadAll({ quiet: true });
    showToast("配置已恢复，建议检查后重启系统");
  } catch (error) { showToast(error.message, true); }
  finally { event.target.value = ""; }
}

async function setAdminPassword(event) {
  event.preventDefault();
  const password = $("#new-password").value;
  if (password.length < 8) return showToast("管理员密码至少需要 8 个字符", true);
  const button = event.submitter;
  button.disabled = true;
  try {
    await api("password_set", { password });
    $("#new-password").value = "";
    showToast("管理员密码已修改，请重新登录");
    setTimeout(logout, 900);
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
}

async function showSystemLogs() {
  try {
    const result = await api("system_logs");
    const output = $("#system-log-output");
    output.textContent = (result.items || []).join("\n") || "暂无 ProxyOS 日志";
    output.classList.toggle("is-hidden");
  } catch (error) { showToast(error.message, true); }
}

async function checkForUpdates(event) {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await api("update_check");
    showToast(
      result.available
        ? `发现新版本 ${result.latest_version}，请在发布页下载已签名镜像`
        : `当前 ${result.current_version} 已是最新版本`,
    );
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function rebootSystem() {
  if (!window.confirm("确认重启 ProxyOS？所有设备会短暂断网。")) return;
  try {
    await api("system_reboot");
    showToast("系统正在重启");
  } catch (error) { showToast(error.message, true); }
}

async function batchBlock() {
  const devices = state.devices.filter((device) => state.selectedDevices.has(device.mac));
  if (!devices.length) return showToast("请先选择设备", true);
  if (!window.confirm(`确认禁止 ${devices.length} 台设备联网？`)) return;
  try {
    for (const device of devices) await api("device_bind", { mac: device.mac, ip: device.ip, name: device.name || "Unknown device", policy: "block", node_id: "" });
    state.selectedDevices.clear(); await loadAll({ quiet: true }); showToast("所选设备已禁止联网");
  } catch (error) { showToast(error.message, true); }
}
async function batchChangeNode() {
  const devices = state.devices.filter((device) => state.selectedDevices.has(device.mac));
  if (!devices.length) return showToast("请先选择设备", true);
  if (!state.nodes.length) return showToast("请先添加代理节点", true);
  const list = state.nodes.map((node, index) => `${index + 1}. ${node.name}`).join("\n");
  const selected = Number(window.prompt(`输入节点序号：\n${list}`, "1")) - 1;
  const node = state.nodes[selected];
  if (!node) return;
  try {
    for (const device of devices) await api("device_bind", { mac: device.mac, ip: device.ip, name: device.name || "Unknown device", policy: "fixed_node", node_id: node.id });
    state.selectedDevices.clear(); await loadAll({ quiet: true }); showToast(`${devices.length} 台设备已切换到 ${node.name}`);
  } catch (error) { showToast(error.message, true); }
}
async function batchEgressCheck() {
  const devices = state.devices.filter((device) => state.selectedDevices.has(device.mac));
  if (!devices.length) return showToast("请先选择设备", true);
  for (const device of devices) await checkEgress(device.mac);
}

async function applyPorts() {
  const assignments = $$(".port-card").map((card) => ({ name: card.dataset.port, role: $(".port-role", card).value }));
  if (assignments.filter((item) => item.role === "wan").length !== 1 || assignments.filter((item) => item.role === "lan").length < 1) return showToast("必须恰好保留一个 WAN，并至少保留一个 LAN", true);
  if (!window.confirm("应用后网络会短暂断开。90 秒内未确认将自动回滚，是否继续？")) return;
  try { await api("ports_apply", { assignments_json: JSON.stringify(assignments) }); $("#port-confirm-panel").classList.remove("is-hidden"); startRollbackCountdown(90); showToast("正在应用网口配置"); }
  catch (error) { showToast(error.message, true); }
}
function startRollbackCountdown(seconds) {
  clearInterval(state.rollbackTimer);
  let remaining = seconds;
  $("#rollback-countdown").textContent = `${remaining} 秒后回滚`;
  state.rollbackTimer = setInterval(() => {
    remaining -= 1; $("#rollback-countdown").textContent = `${Math.max(0, remaining)} 秒后回滚`;
    if (remaining <= 0) { clearInterval(state.rollbackTimer); $("#port-confirm-panel").classList.add("is-hidden"); }
  }, 1000);
}
async function confirmPorts() {
  try {
    await api("ports_confirm"); clearInterval(state.rollbackTimer); $("#port-confirm-panel").classList.add("is-hidden");
    state.ports = unwrapItems(await api("ports")); renderPorts(); showToast("网口配置已确认");
  } catch (error) { showToast(error.message, true); }
}
async function applyConfig(event) {
  const button = event.currentTarget; button.disabled = true; button.textContent = "校验中…";
  try { await api("apply"); state.status = await api("status"); renderSystem(); showToast("配置检查通过，代理核心已重载"); }
  catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; button.textContent = "校验并重载代理配置"; }
}

function bindEvents() {
  hydrateIcons();
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter; button.disabled = true; button.textContent = "正在登录…";
    try { await login($("#login-user").value.trim(), $("#login-password").value); }
    catch (error) { showToast(`登录失败：${error.message}`, true); }
    finally { button.disabled = false; button.textContent = "登录 ProxyOS"; }
  });
  $("#logout-button").addEventListener("click", logout);
  $("#check-update").addEventListener("click", checkForUpdates);
  $("#mobile-menu-button").addEventListener("click", () => $(".sidebar").classList.toggle("is-open"));
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
  $$(".refresh-button").forEach((button) => button.addEventListener("click", () => loadAll()));
  ["#device-search", "#device-status-filter", "#device-connection-filter"].forEach((selector) => $(selector)?.addEventListener(selector === "#device-search" ? "input" : "change", renderDevices));
  $("#select-all-devices").addEventListener("change", (event) => {
    filteredDevices().forEach((device) => event.target.checked ? state.selectedDevices.add(device.mac) : state.selectedDevices.delete(device.mac));
    renderDevices();
  });
  $("#batch-block").addEventListener("click", batchBlock);
  $("#batch-change-node").addEventListener("click", batchChangeNode);
  $("#batch-egress-check").addEventListener("click", batchEgressCheck);
  $("#node-search").addEventListener("input", renderNodes);
  $("#node-protocol-filter").addEventListener("change", renderNodes);
  $$("#node-source-tabs button").forEach((button) => button.addEventListener("click", () => {
    state.nodeSource = button.dataset.value;
    $$("#node-source-tabs button").forEach((item) => item.classList.toggle("is-active", item === button));
    renderNodes();
  }));
  $$("#node-health-tabs button").forEach((button) => button.addEventListener("click", () => {
    state.nodeHealth = button.dataset.value;
    $$("#node-health-tabs button").forEach((item) => item.classList.toggle("is-active", item === button));
    renderNodes();
  }));
  $("#reload-nodes").addEventListener("click", () => loadAll());
  $("#open-node-modal").addEventListener("click", () => openNodeModal());
  $("#open-subscription-modal").addEventListener("click", () => $("#subscription-modal").classList.remove("is-hidden"));
  $$(".close-layer").forEach((button) => button.addEventListener("click", closeLayers));
  $$(".drawer-backdrop, .modal-backdrop").forEach((layer) => layer.addEventListener("click", (event) => { if (event.target === layer) closeLayers(); }));
  $("#device-policy-form").addEventListener("change", syncDrawerNodeState);
  $$("#device-drawer .tab-group button").forEach((button, index) => {
    button.dataset.value = ["all", "subscription", "manual"][index];
    button.addEventListener("click", () => {
      $$("#device-drawer .tab-group button").forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });
  $("#device-policy-form").addEventListener("submit", saveDevicePolicy);
  $("#node-protocol").addEventListener("change", syncNodeProtocolFields);
  $("#node-form").addEventListener("submit", addNode);
  $("#subscription-form").addEventListener("submit", addSubscription);
  $("#apply-ports").addEventListener("click", applyPorts);
  $("#confirm-ports").addEventListener("click", confirmPorts);
  $("#apply-config").addEventListener("click", applyConfig);
  $("#dashboard-filter").addEventListener("click", () => setPage("devices"));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeLayers(); });
}

async function bootstrap() {
  const autoRadio = $("#device-policy-form input[value=auto_node]");
  if (autoRadio) {
    autoRadio.disabled = false;
    autoRadio.closest("label")?.classList.remove("is-disabled");
    const note = autoRadio.closest("label")?.querySelector("small");
    if (note) note.textContent = "按来源自动选择当前延迟最低的可用节点";
  }
  const protocolSelect = $("#node-protocol");
  [
    ["hysteria", "Hysteria"],
    ["anytls", "AnyTLS"],
    ["ssh", "SSH"],
    ["wireguard", "WireGuard"],
  ].forEach(([value, label]) => {
    if (!protocolSelect.querySelector(`option[value="${value}"]`)) protocolSelect.add(new Option(label, value));
  });
  bindEvents();
  syncNodeProtocolFields();
  if (location.hostname === "127.0.0.1" && new URLSearchParams(location.search).has("autologin")) {
    await login("root", "");
    const previewPage = new URLSearchParams(location.search).get("page");
    if (previewPage) setPage(previewPage);
    return;
  }
  if (!state.session) return;
  $("#login-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  try { await loadAll({ quiet: true }); } catch { logout(); }
  startRefreshLoop();
}

bootstrap();
