import type { SubatomConfig } from "./types.js";

export const DEFAULT_CONFIG: SubatomConfig = {
  entry: "src/index.ts",
  outDir: "dist",
  port: 3000,
  host: "0.0.0.0",
  sourcemap: true,
  minify: false,
};