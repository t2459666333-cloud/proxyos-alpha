import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const controller = fs.readFileSync(
  new URL("../rootfs/usr/libexec/proxyos/proxyosctl", import.meta.url),
  "utf8",
);

function shellFunction(name) {
  const start = controller.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `${name} is missing`);
  const next = controller.indexOf("\n}\n", start);
  assert.notEqual(next, -1, `${name} is not terminated`);
  return controller.slice(start, next + 3);
}

test("latency probe follows Mihomo Clash URLTest request semantics", () => {
  const probe = shellFunction("probe_proxy_latency");
  assert.match(probe, /--head/);
  assert.match(probe, /time_starttransfer/);
  assert.match(probe, /max_time="\$\{3:-5\}"/);
  assert.doesNotMatch(probe, /--location/);
  assert.doesNotMatch(probe, /--fail/);
});

test("domestic and foreign latency use stable independent targets", () => {
  assert.match(
    controller,
    /probe_proxy_latency "\$proxy_url" "https:\/\/www\.baidu\.com\/" 5/,
  );
  assert.match(
    controller,
    /probe_proxy_latency "\$proxy_url" "https:\/\/www\.gstatic\.com\/generate_204" 5/,
  );
});
