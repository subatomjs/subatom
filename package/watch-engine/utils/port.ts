import { createServer } from "node:net";
import { logger } from "./logger.js";

function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export async function resolvePort(
  preferred: number,
  host: string,
  maxAttempts = 10,
): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const candidate = preferred + offset;
    if (await isPortFree(candidate, host)) {
      if (offset > 0) {
        logger.warn(`Port ${preferred} is in use, using ${candidate} instead.`);
      }
      return candidate;
    }
  }

  throw new Error(
    `Could not find a free port after checking ${preferred}-${preferred + maxAttempts - 1}. ` +
      `Free up a port or set a different one via --port or subatom.config.ts.`,
  );
}
