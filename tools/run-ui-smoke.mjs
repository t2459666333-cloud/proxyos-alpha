import { spawn, spawnSync } from "node:child_process";

const preview = spawn(process.execPath, ["tools/preview-server.mjs"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "inherit"],
  windowsHide: true,
});

async function waitForPreview() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4173/");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("ProxyOS preview server did not start");
}

try {
  await waitForPreview();
  const smoke = spawn(process.execPath, ["tools/browser-smoke-test.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      PROXYOS_URL: "http://127.0.0.1:4173/",
      PROXYOS_PASSWORD: "preview-test",
    },
  });
  const exitCode = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.error("[ui-smoke] timed out after 75 seconds");
      if (process.platform === "win32") {
        spawnSync("taskkill.exe", ["/PID", String(smoke.pid), "/T", "/F"], { windowsHide: true });
      } else {
        smoke.kill("SIGKILL");
      }
      resolve(124);
    }, 75_000);
    smoke.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  if (exitCode) process.exitCode = exitCode;
} finally {
  preview.kill();
}
