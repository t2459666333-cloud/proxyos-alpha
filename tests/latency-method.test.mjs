import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const controller = fs.readFileSync(
  new URL("../rootfs/usr/libexec/proxyos/proxyosctl", import.meta.url),
  "utf8",
);
const webApp = fs.readFileSync(
  new URL("../rootfs/www/assets/app.js", import.meta.url),
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

test("interrupted node tests terminate child processes and remove temporary files", () => {
  assert.match(controller, /terminate_node_probe_process\(\)/);
  assert.match(controller, /cleanup_node_probe\(\)/);
  assert.match(controller, /cleanup_stale_node_probes\(\)/);
  assert.match(controller, /trap 'controller_cleanup' EXIT/);
  assert.match(controller, /trap 'exit 143' HUP INT TERM/);
  assert.match(controller, /cleanup_node_probe\n\tif \[ "\$latency_foreign"/);
});

test("duplicate node tests fail fast and the UI disables every test action", () => {
  assert.match(controller, /\[ "\$\{command_name:-\}" != "node-test" \] \|\| mutation_max_wait=0/);
  assert.match(controller, /mutation_lock_owned=false/);
  assert.match(controller, /mutation_lock_owned=true/);
  assert.match(controller, /\[ "\$\{mutation_lock_owned:-false\}" != true \] \|\| rm -rf "\$mutation_lock"/);
  assert.match(webApp, /nodeTestInProgress: false/);
  assert.match(webApp, /if \(state\.nodeTestInProgress\)/);
  assert.match(webApp, /\$\$\("\.test-node"\)\.forEach\(\(item\) => \{ item\.disabled = true; \}\)/);
});
