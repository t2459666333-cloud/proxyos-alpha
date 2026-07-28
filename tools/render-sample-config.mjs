import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSingBoxConfig } from "./policy-model.mjs";

const root = path.resolve(import.meta.dirname, "..");
const template = JSON.parse(
  await readFile(
    path.join(root, "rootfs/etc/proxyos/config-template.json"),
    "utf8",
  ),
);
const config = buildSingBoxConfig(
  template,
  [
    {
      id: "test-socks",
      outbound: {
        type: "socks",
        server: "192.0.2.10",
        server_port: 1080,
      },
    },
  ],
  [
    {
      ip: "192.168.10.101",
      policy: "fixed_node",
      node_id: "test-socks",
    },
    {
      ip: "192.168.10.102",
      policy: "direct",
      node_id: "",
    },
    {
      ip: "192.168.10.103",
      policy: "block",
      node_id: "",
    },
  ],
);

// `sing-box check` initializes the TUN. Disable Linux-only routing while
// validating the schema with the official Windows binary in local CI.
if (process.platform === "win32") {
  const tun = config.inbounds.find((item) => item.type === "tun");
  tun.auto_route = false;
  tun.auto_redirect = false;
  tun.strict_route = false;
  delete tun.route_exclude_address;
}

const target = path.join(root, ".sample-sing-box.json");
await writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
console.log(target);
