/**
 * @fileoverview Responsible for default configuration for subatom server.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { SubatomConfig } from "../types/index.types.js";

export const DEFAULT_CONFIG: SubatomConfig = {
	entry: "index.js",
	outDir: "dist",
	port: 8080,
	host: "localhost",
	sourcemap: true,
	minify: false,
	watch: {
		extensions: ["ts", "js", "mjs", "cjs", "json"],
		debounceMs: 300,
		ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
	},
};
