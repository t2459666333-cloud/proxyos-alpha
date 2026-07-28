import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSingBoxConfig,
  stableNodeId,
} from "../tools/policy-model.mjs";

const template = {
  inbounds: [
    {
      type: "tun",
      tag: "proxyos-tun",
      address: ["172.19.0.1/30"],
      auto_route: true,
      auto_redirect: true,
    },
  ],
  outbounds: [{ type: "direct", tag: "direct" }],
  route: {},
};

const nodes = [
  {
    id: "hk01",
    outbound: {
      type: "vless",
      server: "hk.example.com",
      server_port: 443,
      uuid: "test-uuid",
    },
  },
  {
    id: "us02",
    outbound: {
      type: "socks",
      server: "us.example.com",
      server_port: 1080,
    },
  },
];

test("one process can route different source devices to different outbounds", () => {
  const config = buildSingBoxConfig(template, nodes, [
    {
      ip: "192.168.10.101",
      policy: "fixed_node",
      node_id: "hk01",
    },
    {
      ip: "192.168.10.102",
      policy: "fixed_node",
      node_id: "us02",
    },
  ]);
  const hkRule = config.route.rules.find((rule) =>
    rule.source_ip_cidr?.includes("192.168.10.101/32"),
  );
  const usRule = config.route.rules.find((rule) =>
    rule.source_ip_cidr?.includes("192.168.10.102/32"),
  );
  assert.equal(hkRule.outbound, "node-hk01");
  assert.equal(usRule.outbound, "node-us02");
  assert.equal(config.outbounds.length, 3);
  assert.equal(config.dns.rules[0].server, "dns-node-hk01");
  assert.equal(config.dns.rules[1].server, "dns-node-us02");
});

test("missing fixed node fails closed instead of falling back to direct", () => {
  const config = buildSingBoxConfig(template, nodes, [
    {
      ip: "192.168.10.103",
      policy: "fixed_node",
      node_id: "deleted-node",
    },
  ]);
  const rule = config.route.rules.find((item) =>
    item.source_ip_cidr?.includes("192.168.10.103/32"),
  );
  assert.equal(rule.action, "reject");
  assert.equal(rule.method, "drop");
});

test("direct and block policies generate explicit rules", () => {
  const config = buildSingBoxConfig(template, nodes, [
    { ip: "192.168.10.104", policy: "direct" },
    { ip: "192.168.10.105", policy: "block" },
  ]);
  const directRule = config.route.rules.find((rule) =>
    rule.source_ip_cidr?.includes("192.168.10.104/32"),
  );
  const blockRule = config.route.rules.find((rule) =>
    rule.source_ip_cidr?.includes("192.168.10.105/32"),
  );
  assert.deepEqual(directRule, {
    source_ip_cidr: ["192.168.10.104/32"],
    action: "route",
    outbound: "direct",
  });
  assert.equal(blockRule.action, "reject");
});

test("stable node id is independent of JSON property order and display tag", () => {
  const first = stableNodeId("sub-main", {
    tag: "Hong Kong 01",
    type: "vless",
    server: "hk.example.com",
    server_port: 443,
    uuid: "abc",
  });
  const second = stableNodeId("sub-main", {
    uuid: "abc",
    server_port: 443,
    server: "hk.example.com",
    type: "vless",
    tag: "Renamed node",
  });
  assert.equal(first, second);
});
