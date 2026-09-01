import { spawn } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [];
let shuttingDown = false;

const services = [
  {
    name: "api",
    args: ["--filter", "@workspace/api-server", "run", "dev"],
    env: {
      PORT: process.env.API_PORT || "8080",
    },
  },
  {
    name: "web",
    args: ["--filter", "@workspace/glowstore-dz", "run", "dev"],
    env: {
      PORT: process.env.WEB_PORT || "19800",
      BASE_PATH: process.env.BASE_PATH || "/",
      API_URL: process.env.API_URL || "http://127.0.0.1:8080",
    },
  },
];

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(exitCode), 250);
}

for (const service of services) {
  const child = spawn(pnpmCommand, service.args, {
    env: { ...process.env, ...service.env },
    stdio: "inherit",
    windowsHide: false,
  });

  children.push(child);
  child.on("error", (error) => {
    console.error(`[${service.name}] failed to start: ${error.message}`);
    stopAll(1);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown && (code ?? 1) !== 0) {
      console.error(
        `[${service.name}] stopped with ${signal || `exit code ${code}`}`,
      );
      stopAll(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));