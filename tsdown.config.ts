import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["index.ts", "start/cli.ts"],

	outDir: "dist",

	format: ["esm"],

	target: "node24",

	dts: true,

	sourcemap: true,

	clean: true,

	treeshake: true,

	minify: false,

	deps: {
		neverBundle: true,
	},
});
