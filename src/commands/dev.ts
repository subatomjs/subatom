import { createRequire } from "node:module";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { resolveEntry } from "../utils/find-entry.js";
import { resolvePort } from "../utils/port.js";
import { runProcess } from "../utils/spawn-process.js";
import { logger } from "../utils/logger.js";

interface DevOptions {
  port?: string;
  host?: string;
}

export async function runDev(opts: DevOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  const entry = resolveEntry(config.entry, cwd);
  const host = opts.host ?? config.host;
  const preferredPort = opts.port ? Number(opts.port) : config.port;

  if (Number.isNaN(preferredPort)) {
    logger.error(`Invalid port: "${opts.port}"`);
    process.exit(1);
  }

  const port = await resolvePort(preferredPort, host);

  // Resolve the tsx CLI binary from subatom's own node_modules so we don't
  // depend on tsx being globally installed or hoisted into the user's project.
  const require = createRequire(import.meta.url);
  const tsxCliPath = require.resolve("tsx/cli");

  logger.info(`Starting dev server for ${path.relative(cwd, entry)}`);
  logger.success(`Listening on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);

  runProcess(process.execPath, [tsxCliPath, "watch", entry], {
    cwd,
    label: "dev server",
    env: {
      NODE_ENV: "development",
      PORT: String(port),
      HOST: host,
    },
  });
}