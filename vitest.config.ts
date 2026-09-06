// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"**/node_modules/**",
				"**/tests/**",
				"**/*.d.ts",
				"**/*.config.*",
				"**/tsdown.config.ts",
				"**/types.ts",
				"**/types/**",
				"**/index.ts",
				"**/index.*.ts",
				"**/start/cli.ts",
				"**/*.export.ts",
				"**/config.export.ts",
			],
			thresholds: {
				lines: 99,
				functions: 99,
				branches: 95,
				statements: 99,
			},
		},
	},
});
