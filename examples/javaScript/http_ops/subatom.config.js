const { defineConfig } = require("subatom");

module.exports = defineConfig({
  port: 8080,
  host: "localhost",
  outDir: "build",
  sourcemap: true,
  minify: true,
  entry: "index.js",
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
});
