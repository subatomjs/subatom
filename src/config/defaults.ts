import type { SubatomConfig } from "./types.js";

export const DEFAULT_CONFIG: SubatomConfig = {
	entry: "src/index.ts",
	outDir: "dist",
	port: 8080,
	host: "localhost",
	sourcemap: true,
	minify: false,
	watch: {
		extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
		debounceMs: 300,
		ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
	},
};
