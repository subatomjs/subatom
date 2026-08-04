import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "./logger.js";

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  label: string;
}

export function runProcess(command: string, args: string[], opts: RunOptions): ChildProcess {
  const child = spawn(command, args, {
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Shutting down ${opts.label}...`);
    child.kill(signal);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      process.exit(0);
    }
    if (code !== 0 && code !== null) {
      logger.error(`${opts.label} exited with code ${code}${signal ? ` (${signal})` : ""}`);
      process.exit(code);
    }
  });

  child.on("error", (err) => {
    logger.error(`Failed to start ${opts.label}: ${err.message}`);
    process.exit(1);
  });

  return child;
}