import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["index.ts", "start/cli.ts"],

	outDir: "dist",

	format: ["esm"],

	target: "node24",

	dts: true,

	// Disables bundling/chunking and preserves 1:1 source file structure
	bundle: false,

	outExtension() {
		return {
			js: ".js",
			dts: ".d.ts",
		};
	},

	sourcemap: true,

	clean: true,

	treeshake: true,

	minify: false,

	deps: {
		neverBundle: true,
	},
});
