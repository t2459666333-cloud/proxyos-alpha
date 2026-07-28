const ZERO_SESSION = "00000000000000000000000000000000";

const state = {
  session: sessionStorage.getItem("proxyos_session") || "",
  page: "dashboard",
  status: {},
  devices: [],
  nodes: [],
  wifi: {},
  ports: [],
  subscriptions: [],
  selectedDevice: null,
  rollbackTimer: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

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
  return days ? `${days} 天 ${hours} 小时` : `${hours} 小时 ${minutes} 分`;
};

const formatTime = (timestamp) => {
  if (!timestamp) return "尚未更新";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
};

const showToast = (message, error = false) => {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
};

async function ubusCall(object, method, payload = {}, session = state.session) {
  const response = await fetch("/ubus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "call",
      params: [session || ZERO_SESSION, object, method, payload],
    }),
  });
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

const api = (method, payload = {}) => ubusCall("proxyos", method, payload);

async function login(username, password) {
  const result = await ubusCall(
    "session",
    "login",
    { username, password },
    ZERO_SESSION,
  );
  const session = result.ubus_rpc_session;
  if (!session) throw new Error("未获得登录会话");
  state.session = session;
  sessionStorage.setItem("proxyos_session", session);
  $("#login-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  await loadAll({ quiet: true });
}

function logout() {
  state.session = "";
  sessionStorage.removeItem("proxyos_session");
  $("#app-shell").classList.add("is-hidden");
  $("#login-screen").classList.remove("is-hidden");
  $("#login-password").value = "";
}

async function loadAll({ quiet = false } = {}) {
  const requests = [
    ["status", "status"],
    ["devices", "devices"],
    ["nodes", "nodes"],
    ["wifi", "wifi_status"],
    ["ports", "ports"],
    ["subscriptions", "subscriptions"],
  ];
  const results = await Promise.allSettled(
    requests.map(([, method]) => api(method)),
  );

  let hadError = false;
  results.forEach((result, index) => {
    const [key] = requests[index];
    if (result.status === "fulfilled") state[key] = result.value;
    else {
      hadError = true;
      if (String(result.reason?.message).includes("登录已过期")) logout();
      console.error(`${key}:`, result.reason);
    }
  });

  renderAll();
  if (!quiet) showToast(hadError ? "部分状态读取失败" : "状态已更新", hadError);
}

function memoryPercent() {
  const memory = state.status.memory || {};
  const total = Number(memory.total || 0);
  if (!total) return 0;
  const available =
    Number(memory.free || 0) +
    Number(memory.buffered || 0) +
    Number(memory.cached || 0);
  return Math.max(0, Math.min(100, Math.round(((total - available) / total) * 100)));
}

function egressFor(device) {
  if (device.policy === "direct") return "本地直连";
  if (device.policy === "block") return "禁止联网";
  if (device.policy === "fixed_node") {
    return state.nodes.find((node) => node.id === device.node_id)?.name || "节点已失效";
  }
  return "系统默认";
}

function policyLabel(policy) {
  return {
    fixed_node: "指定节点",
    direct: "完全直连",
    block: "禁止联网",
    system_default: "系统默认",
  }[policy] || "系统默认";
}

function renderDashboard() {
  const online = state.devices.filter((device) => device.online).length;
  const metrics = [
    ["在线设备", online, `共记录 ${state.devices.length} 台`, "▣"],
    ["独立代理", state.status.bound_device_count || 0, "绑定指定节点", "◇"],
    ["可用节点", state.status.node_count || state.nodes.length, "手动与订阅统一", "↗"],
    ["系统已运行", formatUptime(state.status.uptime), state.status.model || "x86-64", "◷"],
  ];
  $("#metric-grid").innerHTML = metrics
    .map(
      ([label, value, sub, icon]) => `
        <article class="metric-card">
          <div class="metric-label"><span>${escapeHtml(label)}</span><i class="metric-icon">${icon}</i></div>
          <div class="metric-value">${escapeHtml(value)}</div>
          <div class="metric-sub">${escapeHtml(sub)}</div>
        </article>`,
    )
    .join("");

  const load = Array.isArray(state.status.load) ? state.status.load[0] : 0;
  $("#download-rate").textContent = state.status.singbox_running ? "透明代理已接管" : "核心未运行";
  $("#upload-rate").textContent = `${memoryPercent()}% 内存`;
  $("#load-rate").textContent = load ? (Number(load) / 65535).toFixed(2) : "0.00";

  const list = state.devices.slice(0, 5);
  $("#dashboard-devices").innerHTML = list.length
    ? list
        .map(
          (device) => `
          <div class="compact-device">
            <span class="device-avatar">${escapeHtml((device.name || "?").slice(0, 1).toUpperCase())}</span>
            <div><strong>${escapeHtml(device.name || "未知设备")}</strong><small>${escapeHtml(device.ip || "离线")}</small></div>
            <div class="compact-egress"><strong>${escapeHtml(egressFor(device))}</strong><small>${device.online ? "在线" : "离线"}</small></div>
          </div>`,
        )
        .join("")
    : `<div class="empty-state">等待终端获取 DHCP 地址</div>`;
}

function renderDevices(filter = $("#device-search")?.value || "") {
  const query = filter.trim().toLowerCase();
  const devices = state.devices.filter((device) =>
    [device.name, device.ip, device.mac]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
  $("#device-table-body").innerHTML = devices.length
    ? devices
        .map(
          (device) => `
          <tr>
            <td><div class="device-cell"><span class="device-avatar">${escapeHtml((device.name || "?").slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(device.name || "未知设备")}</strong><small>${escapeHtml(device.mac || "")}</small></div></div></td>
            <td>${escapeHtml(device.ip || "—")}</td>
            <td><span class="badge gray">${device.connection || "LAN / Wi‑Fi"}</span></td>
            <td>${escapeHtml(policyLabel(device.policy))}</td>
            <td><strong>${escapeHtml(egressFor(device))}</strong></td>
            <td><span class="badge ${device.online ? "green" : "gray"}">${device.online ? "● 在线" : "离线"}</span></td>
            <td><button class="row-action edit-device" data-mac="${escapeHtml(device.mac)}">设置出口</button></td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="7"><div class="empty-state">没有匹配的设备</div></td></tr>`;

  $$(".edit-device").forEach((button) =>
    button.addEventListener("click", () => openDeviceDrawer(button.dataset.mac)),
  );
}

function renderNodes(filter = $("#node-search")?.value || "") {
  const query = filter.trim().toLowerCase();
  const nodes = state.nodes.filter((node) =>
    [node.name, node.protocol, node.server]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
  $("#node-grid").innerHTML = nodes.length
    ? nodes
        .map(
          (node) => `
          <article class="card node-card">
            <div class="node-card-top">
              <div><h3>${escapeHtml(node.name)}</h3><p>${escapeHtml(node.server || "服务器地址已保护")}</p></div>
              <span class="badge green">● 已配置</span>
            </div>
            <div class="node-card-meta">
              <div><span>协议</span><strong>${escapeHtml(String(node.protocol).toUpperCase())}</strong></div>
              <div><span>端口</span><strong>${escapeHtml(node.server_port || "—")}</strong></div>
            </div>
            <div class="node-actions">
              <span class="source-pill">${node.source_type === "manual" ? "手动节点" : "订阅节点"}</span>
              <button class="text-button delete-node" data-id="${escapeHtml(node.id)}">删除</button>
            </div>
          </article>`,
        )
        .join("")
    : `<div class="card empty-state">节点库为空，请添加手动节点或订阅。</div>`;

  $$(".delete-node").forEach((button) =>
    button.addEventListener("click", () => deleteNode(button.dataset.id)),
  );
}

function renderSubscriptions() {
  $("#subscription-grid").innerHTML = state.subscriptions.length
    ? state.subscriptions
        .map(
          (subscription) => `
          <article class="card subscription-card">
            <span class="source-pill">SING-BOX JSON</span>
            <h3>${escapeHtml(subscription.name)}</h3>
            <p>最后更新：${escapeHtml(formatTime(subscription.last_update))}</p>
            <div class="subscription-foot">
              <span class="badge ${subscription.status === "ok" ? "green" : "gray"}">${subscription.status === "ok" ? "● 正常" : "等待首次更新"}</span>
              <button class="button button-soft update-subscription" data-id="${escapeHtml(subscription.id)}">立即更新</button>
            </div>
          </article>`,
        )
        .join("")
    : `<div class="card empty-state">还没有订阅。第一版支持 sing-box JSON 订阅。</div>`;

  $$(".update-subscription").forEach((button) =>
    button.addEventListener("click", () => updateSubscription(button)),
  );
}

function renderWifi() {
  const wifi = state.wifi || {};
  if (!wifi.available) {
    $("#wifi-content").innerHTML = `
      <article class="card wifi-hero">
        <div class="wifi-main">
          <span class="eyebrow">HARDWARE NOT AVAILABLE</span>
          <h2>Wi‑Fi 功能不可用</h2>
          <p>${escapeHtml(wifi.reason || "未检测到支持 AP 模式的无线网卡。")} 系统仍会正常管理通过独立 AP 接入的设备，但不能控制外部 AP 的无线开关。</p>
          <button class="button button-soft" disabled>无线开关不可操作</button>
        </div>
        <div class="wifi-details"><div class="wifi-ring">×</div><div class="wifi-facts"><div><small>无线 PHY</small><strong>未检测</strong></div><div><small>AP 模式</small><strong>不可用</strong></div></div></div>
      </article>`;
    return;
  }
  $("#wifi-content").innerHTML = `
    <article class="card wifi-hero">
      <div class="wifi-main">
        <span class="eyebrow">${wifi.enabled ? "WIRELESS ONLINE" : "WIRELESS READY"}</span>
        <h2>Wi‑Fi ${wifi.enabled ? "已开启" : "已关闭"}</h2>
        <p>已检测到支持 AP 模式的无线硬件。关闭无线只影响本机射频，不删除 SSID、密码、设备绑定或代理策略。</p>
        <button id="wifi-toggle" class="button ${wifi.enabled ? "button-danger" : "button-primary"}">${wifi.enabled ? "关闭 Wi‑Fi" : "开启 Wi‑Fi"}</button>
      </div>
      <div class="wifi-details"><div class="wifi-ring">⌁</div><div class="wifi-facts"><div><small>无线 PHY</small><strong>${escapeHtml(wifi.phy || "—")}</strong></div><div><small>驱动</small><strong>${escapeHtml(wifi.driver || "—")}</strong></div></div></div>
    </article>`;
  $("#wifi-toggle").addEventListener("click", toggleWifi);
}

function renderPorts() {
  $("#port-grid").innerHTML = state.ports.length
    ? state.ports
        .map(
          (port, index) => `
          <article class="card port-card" data-port="${escapeHtml(port.name)}">
            <div class="port-card-top"><span class="port-symbol">⇄</span><span class="badge ${port.state === "up" ? "green" : "gray"}">${port.state === "up" ? "● 已连接" : "未连接"}</span></div>
            <h3>网口 ${index + 1} · ${escapeHtml(port.name)}</h3>
            <p>${escapeHtml(port.driver || "未知驱动")} · ${port.speed_mbps ? `${escapeHtml(port.speed_mbps)} Mbps` : "速度未知"} · ${escapeHtml(port.mac)}</p>
            <select class="port-role">
              <option value="wan" ${port.role === "wan" ? "selected" : ""}>WAN</option>
              <option value="lan" ${port.role === "lan" ? "selected" : ""}>LAN</option>
              <option value="unused" ${port.role === "unused" ? "selected" : ""}>未使用</option>
            </select>
          </article>`,
        )
        .join("")
    : `<div class="card empty-state">没有检测到物理以太网接口</div>`;
}

function renderSystem() {
  $("#system-version").textContent = state.status.version || "0.1.0-alpha";
  $("#system-model").textContent = state.status.model || "x86-64";
  $("#system-kernel").textContent = state.status.kernel || "—";
  $("#system-core").textContent = state.status.singbox_running ? "运行正常" : "未运行";
  const dot = $("#sidebar-core-dot");
  dot.classList.toggle("is-online", Boolean(state.status.singbox_running));
  dot.classList.toggle("is-error", !state.status.singbox_running);
  $("#sidebar-core-text").textContent = state.status.singbox_running ? "代理核心运行中" : "代理核心未运行";
}

function renderAll() {
  renderDashboard();
  renderDevices();
  renderNodes();
  renderSubscriptions();
  renderWifi();
  renderPorts();
  renderSystem();
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
  $("#drawer-device-meta").innerHTML = `
    <div><span>内网 IP</span><strong>${escapeHtml(device.ip)}</strong></div>
    <div><span>MAC 地址</span><strong>${escapeHtml(device.mac)}</strong></div>`;
  const policy = device.policy || "system_default";
  const radio = $(`#device-policy-form input[value="${policy}"]`);
  if (radio) radio.checked = true;
  $("#drawer-node-select").innerHTML = state.nodes.length
    ? state.nodes
        .map((node) => `<option value="${escapeHtml(node.id)}" ${device.node_id === node.id ? "selected" : ""}>${escapeHtml(node.name)} · ${escapeHtml(node.protocol.toUpperCase())}</option>`)
        .join("")
    : `<option value="">没有可用节点</option>`;
  syncDrawerNodeState();
  $("#device-drawer").classList.remove("is-hidden");
}

function closeLayers() {
  $$(".drawer-backdrop, .modal-backdrop").forEach((layer) => layer.classList.add("is-hidden"));
}

function syncDrawerNodeState() {
  const selected = $("#device-policy-form input[name=policy]:checked")?.value;
  $("#drawer-node-select").disabled = selected !== "fixed_node";
}

async function saveDevicePolicy(event) {
  event.preventDefault();
  const device = state.selectedDevice;
  if (!device) return;
  const policy = $("#device-policy-form input[name=policy]:checked")?.value || "system_default";
  const nodeId = $("#drawer-node-select").value;
  if (policy === "fixed_node" && !nodeId) {
    showToast("请先添加并选择一个节点", true);
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "正在校验并应用…";
  try {
    await api("device_bind", {
      mac: device.mac,
      ip: device.ip,
      name: device.name || "Unknown device",
      policy,
      node_id: policy === "fixed_node" ? nodeId : "",
    });
    closeLayers();
    await loadAll({ quiet: true });
    showToast("设备出口已更新");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "保存并应用";
  }
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
  if (protocol === "trojan" || protocol === "hysteria2") outbound.password = secret;
  if (protocol === "tuic") Object.assign(outbound, { uuid: identity, password: secret });
  if (protocol === "shadowsocks") Object.assign(outbound, { method: identity || "2022-blake3-aes-128-gcm", password: secret });
  if (protocol === "socks" || protocol === "http") {
    if (identity) outbound.username = identity;
    if (secret) outbound.password = secret;
  }
  if ($("#node-tls").checked && ["vless", "vmess", "trojan", "hysteria2", "tuic"].includes(protocol)) {
    outbound.tls = { enabled: true, server_name: server };
  }
  return outbound;
}

async function addNode(event) {
  event.preventDefault();
  const button = event.submitter;
  try {
    const outbound = protocolOutbound();
    button.disabled = true;
    button.textContent = "正在检查…";
    await api("node_add", {
      name: $("#node-name").value.trim(),
      outbound_json: JSON.stringify(outbound),
    });
    event.target.reset();
    closeLayers();
    await loadAll({ quiet: true });
    showToast("节点已保存");
  } catch (error) {
    showToast(`节点未保存：${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "检查并保存节点";
  }
}

async function deleteNode(id) {
  if (!window.confirm("删除节点后，绑定它的设备将切换为阻断联网。继续吗？")) return;
  try {
    await api("node_delete", { id });
    await loadAll({ quiet: true });
    showToast("节点已删除，相关设备已安全阻断");
  } catch (error) {
    showToast(error.message, true);
  }
}

function syncNodeProtocolFields() {
  const raw = $("#node-protocol").value === "raw";
  $$(".standard-node-field").forEach((field) => field.classList.toggle("is-hidden", raw));
  $("#tls-field").classList.toggle("is-hidden", raw);
  $("#raw-json-field").classList.toggle("is-hidden", !raw);
}

async function addSubscription(event) {
  event.preventDefault();
  const button = event.submitter;
  try {
    button.disabled = true;
    await api("subscription_add", {
      name: $("#subscription-name").value.trim(),
      url: $("#subscription-url").value.trim(),
    });
    event.target.reset();
    closeLayers();
    await loadAll({ quiet: true });
    showToast("订阅已保存，请点击“立即更新”");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function updateSubscription(button) {
  button.disabled = true;
  button.textContent = "更新中…";
  try {
    await api("subscription_update", { id: button.dataset.id });
    await loadAll({ quiet: true });
    showToast("订阅已更新，设备绑定保持不变");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "立即更新";
  }
}

async function toggleWifi(event) {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api("wifi_toggle", { enabled: !state.wifi.enabled });
    state.wifi = await api("wifi_status");
    renderWifi();
    showToast(state.wifi.enabled ? "Wi‑Fi 已开启" : "Wi‑Fi 已关闭");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function applyPorts() {
  const assignments = $$(".port-card").map((card) => ({
    name: card.dataset.port,
    role: $(".port-role", card).value,
  }));
  const wanCount = assignments.filter((item) => item.role === "wan").length;
  const lanCount = assignments.filter((item) => item.role === "lan").length;
  if (wanCount !== 1 || lanCount < 1) {
    showToast("必须恰好保留一个 WAN，并至少保留一个 LAN", true);
    return;
  }
  if (!window.confirm("应用后网络会短暂断开。90 秒内未确认将自动回滚，是否继续？")) return;
  try {
    await api("ports_apply", { assignments_json: JSON.stringify(assignments) });
    $("#port-confirm-panel").classList.remove("is-hidden");
    startRollbackCountdown(90);
    showToast("正在应用网口配置，请等待网络恢复");
  } catch (error) {
    showToast(error.message, true);
  }
}

function startRollbackCountdown(seconds) {
  clearInterval(state.rollbackTimer);
  let remaining = seconds;
  $("#rollback-countdown").textContent = `${remaining} 秒后回滚`;
  state.rollbackTimer = setInterval(() => {
    remaining -= 1;
    $("#rollback-countdown").textContent = `${Math.max(0, remaining)} 秒后回滚`;
    if (remaining <= 0) {
      clearInterval(state.rollbackTimer);
      $("#port-confirm-panel").classList.add("is-hidden");
    }
  }, 1000);
}

async function confirmPorts() {
  try {
    await api("ports_confirm");
    clearInterval(state.rollbackTimer);
    $("#port-confirm-panel").classList.add("is-hidden");
    state.ports = await api("ports");
    renderPorts();
    showToast("网口配置已确认");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function applyConfig(event) {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "校验中…";
  try {
    await api("apply");
    state.status = await api("status");
    renderSystem();
    showToast("配置检查通过，代理核心已重载");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "校验并重载";
  }
}

function bindEvents() {
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    button.textContent = "正在登录…";
    try {
      await login($("#login-user").value.trim(), $("#login-password").value);
    } catch (error) {
      showToast(`登录失败：${error.message}`, true);
    } finally {
      button.disabled = false;
      button.textContent = "登录 ProxyOS";
    }
  });
  $("#logout-button").addEventListener("click", logout);
  $("#mobile-menu-button").addEventListener("click", () => $(".sidebar").classList.toggle("is-open"));
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
  $$("[data-go-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.goPage)));
  $$(".refresh-button").forEach((button) => button.addEventListener("click", () => loadAll()));
  $("#device-search").addEventListener("input", (event) => renderDevices(event.target.value));
  $("#node-search").addEventListener("input", (event) => renderNodes(event.target.value));
  $("#reload-nodes").addEventListener("click", () => loadAll());
  $("#open-node-modal").addEventListener("click", () => $("#node-modal").classList.remove("is-hidden"));
  $("#open-subscription-modal").addEventListener("click", () => $("#subscription-modal").classList.remove("is-hidden"));
  $$(".close-layer").forEach((button) => button.addEventListener("click", closeLayers));
  $$(".drawer-backdrop, .modal-backdrop").forEach((layer) =>
    layer.addEventListener("click", (event) => {
      if (event.target === layer) closeLayers();
    }),
  );
  $("#device-policy-form").addEventListener("change", syncDrawerNodeState);
  $("#device-policy-form").addEventListener("submit", saveDevicePolicy);
  $("#node-protocol").addEventListener("change", syncNodeProtocolFields);
  $("#node-form").addEventListener("submit", addNode);
  $("#subscription-form").addEventListener("submit", addSubscription);
  $("#apply-ports").addEventListener("click", applyPorts);
  $("#confirm-ports").addEventListener("click", confirmPorts);
  $("#apply-config").addEventListener("click", applyConfig);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLayers();
  });
}

async function bootstrap() {
  bindEvents();
  syncNodeProtocolFields();
  if (
    location.hostname === "127.0.0.1" &&
    new URLSearchParams(location.search).has("autologin")
  ) {
    await login("root", "");
    const previewPage = new URLSearchParams(location.search).get("page");
    if (previewPage) setPage(previewPage);
    return;
  }
  if (!state.session) return;
  $("#login-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  try {
    await loadAll({ quiet: true });
  } catch {
    logout();
  }
  setInterval(() => {
    if (state.session) loadAll({ quiet: true });
  }, 15000);
}

bootstrap();
