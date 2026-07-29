import { createHash } from "node:crypto";

export function stableNodeId(sourceId, outbound) {
  const canonical = canonicalJson(stripTag(outbound));
  return createHash("sha256")
    .update(`${sourceId}|${canonical}`)
    .digest("hex")
    .slice(0, 16);
}

export function stripTag(outbound) {
  const copy = structuredClone(outbound);
  delete copy.tag;
  return copy;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildSingBoxConfig(template, nodes, devices, global = {}) {
  const config = structuredClone(template);
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!config.inbounds.some((inbound) => inbound.tag === "proxyos-dns-in")) {
    config.inbounds.push({
      type: "direct",
      tag: "proxyos-dns-in",
      listen: "0.0.0.0",
      listen_port: 1053,
    });
  }
  config.outbounds = [
    ...nodes.map((node) => ({
      ...structuredClone(node.outbound),
      tag: `node-${node.id}`,
    })),
    { type: "direct", tag: "direct" },
  ];

  const blockRules = devices
    .filter(
      (device) =>
        device.ip &&
        (device.policy === "block" ||
          (device.policy === "fixed_node" && !nodeIds.has(device.node_id))),
    )
    .map((device) => ({
      source_ip_cidr: [`${device.ip}/32`],
      action: "reject",
      method: "drop",
    }));

  const deviceRules = devices
    .filter((device) => device.ip)
    .flatMap((device) => {
      const match = { source_ip_cidr: [`${device.ip}/32`] };
      if (device.policy === "direct") {
        return [{ ...match, action: "route", outbound: "direct" }];
      }
      if (device.policy === "fixed_node") {
        if (!nodeIds.has(device.node_id)) return [];
        return [
          {
            ...match,
            action: "route",
            outbound: `node-${device.node_id}`,
          },
        ];
      }
      return [];
    });

  config.dns = {
    servers: [
      {
        type: "https",
        tag: "dns-direct",
        server: "1.1.1.1",
        path: "/dns-query",
        tls: { enabled: true, server_name: "cloudflare-dns.com" },
      },
      ...nodes.map((node) => ({
        type: "https",
        tag: `dns-node-${node.id}`,
        server: "1.1.1.1",
        path: "/dns-query",
        tls: { enabled: true, server_name: "cloudflare-dns.com" },
        detour: `node-${node.id}`,
      })),
    ],
    rules: devices.flatMap((device) => {
      if (!device.ip || device.policy === "block") return [];
      if (device.policy === "fixed_node" && nodeIds.has(device.node_id)) {
        return [
          {
            source_ip_cidr: [`${device.ip}/32`],
            action: "route",
            server: `dns-node-${device.node_id}`,
          },
        ];
      }
      if (device.policy === "direct" || device.policy === "system_default") {
        return [
          {
            source_ip_cidr: [`${device.ip}/32`],
            action: "route",
            server: "dns-direct",
          },
        ];
      }
      return [];
    }),
    final: "dns-direct",
    strategy: "ipv4_only",
  };

  config.route = {
    ...(config.route || {}),
    auto_detect_interface: true,
    rules: [
      { action: "sniff" },
      ...blockRules,
      { inbound: "proxyos-dns-in", action: "hijack-dns" },
      { protocol: "dns", action: "hijack-dns" },
      {
        ip_is_private: true,
        action: "route",
        outbound: "direct",
      },
      ...deviceRules,
    ],
    final:
      global.default_policy === "fixed_node" &&
      nodeIds.has(global.default_node_id)
        ? `node-${global.default_node_id}`
        : "direct",
  };
  return config;
}
