import type { SubatomConfig } from "../types/config/SubatomConfig.js";

export const DEFAULT_CONFIG: SubatomConfig = {
  // 🟢 Keep entry pointing to standard fallback (resolveEntry handles the rest)
  entry: "index.js",
  outDir: "dist",
  port: 8080,
  host: "localhost",
  sourcemap: true,
  minify: false,
  websocket: true,
  websocketOptions: {
    heartbeatIntervalMs: 30_000,
    maxMessagesPerSecond: 20,
    maxPayloadBytes: 1024 * 1024,
    shutdownTimeoutMs: 5_000,
    perMessageDeflate: true,
  },
  watch: {
    extensions: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "json"],
    debounceMs: 250,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
  },
};
