/** biome-ignore-all lint/suspicious/noExplicitAny: test mocks require flexible types */
/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import * as esbuild from "esbuild";

import { runBuild } from "../../../start/commands/build.js";
import * as loadConfig from "../../../config/helpers/load.config.js";
import * as utils from "../../../start/utils/index.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("node:fs");
vi.mock("esbuild");
vi.mock("../../../config/helpers/load.config.js");

describe("runBuild - Custom Enterprise 100% Coverage Suite", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
	let loggerSuccessSpy: ReturnType<typeof vi.spyOn>;
	let loggerInfoSpy: ReturnType<typeof vi.spyOn>;
	// biome-ignore lint/correctness/noUnusedVariables: explanation
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	const cwd = "/mock/cwd";
	const entryFile = "/mock/cwd/src/subatom.config.ts";
	const srcDir = "/mock/cwd/src";
	const outDir = "/mock/cwd/dist";

	function dir(name: string) {
		return {
			name,
			isDirectory: () => true,
			isFile: () => false,
		};
	}

	function file(name: string) {
		return {
			name,
			isDirectory: () => false,
			isFile: () => true,
		};
	}

	function configureBasicFs(): void {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);

		vi.spyOn(fs, "statSync").mockImplementation((target: any) => {
			const value = String(target);

			if (value === entryFile) {
				return {
					isFile: () => true,
					isDirectory: () => false,
				} as any;
			}

			if (value === srcDir) {
				return {
					isFile: () => false,
					isDirectory: () => true,
				} as any;
			}

			return {
				isFile: () => true,
				isDirectory: () => false,
			} as any;
		});

		vi.spyOn(fs, "readdirSync").mockReturnValue([
			file("subatom.config.ts"),
		] as any);

		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		vi.spyOn(fs, "copyFileSync").mockReturnValue(undefined);
		vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
		vi.spyOn(fs, "rmSync").mockReturnValue(undefined);

		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);
	}

	beforeEach(() => {
		vi.clearAllMocks();

		exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit called");
		}) as any);

		loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

		loggerSuccessSpy = vi.spyOn(logger, "success").mockImplementation(() => {});

		loggerInfoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		vi.spyOn(process, "cwd").mockReturnValue(cwd);

		vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
			entry: "src/subatom.config.ts",
			outDir: "dist",
		} as any);

		vi.spyOn(utils, "readUserPackageJson").mockReturnValue({
			type: "module",
		} as any);

		vi.spyOn(utils, "resolveEntry").mockReturnValue(entryFile);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("entry resolution & validation", () => {
		it("should exit when entry resolution throws an Error", async () => {
			vi.spyOn(utils, "resolveEntry").mockImplementation(() => {
				throw new Error("Resolution failed");
			});

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(loggerErrorSpy).toHaveBeenCalledWith("Resolution failed");
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should exit when entry resolution throws a non-Error", async () => {
			vi.spyOn(utils, "resolveEntry").mockImplementation(() => {
				throw "Raw string error";
			});

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(loggerErrorSpy).toHaveBeenCalledWith("Raw string error");
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should exit when the entry file does not exist", async () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(false);

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(loggerErrorSpy).toHaveBeenCalledWith(
				"Entry file not found: src/subatom.config.ts",
			);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should exit when the entry path is not a file", async () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "statSync").mockReturnValue({
				isFile: () => false,
				isDirectory: () => true,
			} as any);

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(loggerErrorSpy).toHaveBeenCalledWith(
				"Entry path is not a file: src/subatom.config.ts",
			);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should exit when the entry extension is unsupported", async () => {
			vi.spyOn(utils, "resolveEntry").mockReturnValue(
				"/mock/cwd/src/subatom.config.css",
			);
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "statSync").mockReturnValue({
				isFile: () => true,
				isDirectory: () => false,
			} as any);

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(loggerErrorSpy).toHaveBeenCalledWith(
				"Unsupported entry file type: src/subatom.config.css",
			);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});
	});

	describe("source directory validation", () => {
		it("should exit when source directory does not exist", async () => {
			vi.spyOn(fs, "existsSync").mockImplementation(
				(target: any) => String(target) === entryFile,
			);
			vi.spyOn(fs, "statSync").mockReturnValue({
				isFile: () => true,
				isDirectory: () => false,
			} as any);

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(loggerErrorSpy).toHaveBeenCalledWith(
				"Source directory not found: src",
			);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should exit when source path is not a directory", async () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			let statCount = 0;
			vi.spyOn(fs, "statSync").mockImplementation(() => {
				statCount++;
				if (statCount === 1) {
					return { isFile: () => true, isDirectory: () => false } as any;
				}
				return { isFile: () => false, isDirectory: () => false } as any;
			});

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(loggerErrorSpy).toHaveBeenCalledWith(
				"Source path is not a directory: src",
			);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});
	});

	describe("file traversal and filtering (isIgnoredFile / walk)", () => {
		it("should filter out ignored files, config files, dot directories, and ignored directories", async () => {
			configureBasicFs();

			vi.spyOn(fs, "readdirSync").mockImplementation((target: any) => {
				const value = String(target);
				if (value === srcDir) {
					return [
						file("subatom.config.ts"),
						file("tsconfig.json"),
						file("eslint.config.js"),
						file("prettier.config.js"),
						file(".env"),
						dir(".git"),
						dir("node_modules"),
					] as any;
				}
				return [] as any;
			});

			await runBuild();

			expect(esbuild.build).toHaveBeenCalledWith(
				expect.objectContaining({
					entryPoints: [`${srcDir}/subatom.config.ts`],
				}),
			);
		});
	});

	describe("static assets and plural/singular logging", () => {
		it("should correctly handle plural and singular counts for files and static assets", async () => {
			configureBasicFs();

			vi.spyOn(fs, "readdirSync").mockReturnValue([
				file("subatom.config.ts"),
				file("helper.ts"),
				file("notes.graphql"),
			] as any);

			await runBuild();

			expect(loggerInfoSpy).toHaveBeenCalledWith("Building 2 source files...");
			expect(loggerInfoSpy).toHaveBeenCalledWith("Copying 1 asset...");
			expect(loggerSuccessSpy).toHaveBeenCalledWith(
				"Compiled 2 source files successfully.",
			);
			expect(loggerSuccessSpy).toHaveBeenCalledWith(
				"Copied 1 asset successfully.",
			);
		});

		it("should handle multiple static assets and nested asset directories", async () => {
			configureBasicFs();

			vi.spyOn(fs, "readdirSync").mockImplementation((target: any) => {
				const value = String(target);
				if (value === srcDir) {
					return [
						file("subatom.config.ts"),
						file("notes.graphql"),
						dir("schemas"),
					] as any;
				}
				if (value.endsWith("schemas")) {
					return [file("api.graphql")] as any;
				}
				return [] as any;
			});

			await runBuild();

			expect(fs.copyFileSync).toHaveBeenCalledTimes(2);
			expect(loggerInfoSpy).toHaveBeenCalledWith("Copying 2 assets...");
			expect(loggerSuccessSpy).toHaveBeenCalledWith(
				"Copied 2 assets successfully.",
			);
		});
	});

	describe("build configurations (CommonJS, sourcemap, minify, custom outDir)", () => {
		it("should support CommonJS and custom output configurations", async () => {
			vi.spyOn(utils, "readUserPackageJson").mockReturnValue({
				type: "commonjs",
			} as any);
			vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
				entry: "src/subatom.config.ts",
				outDir: "build",
				sourcemap: false,
				minify: true,
			} as any);

			configureBasicFs();

			await runBuild();

			expect(esbuild.build).toHaveBeenCalledWith(
				expect.objectContaining({
					format: "cjs",
					sourcemap: false,
					minify: true,
				}),
			);
		});
	});

	describe("error handling during build and replacement", () => {
		it("should clean tmpDir if it exists before creating it", async () => {
			configureBasicFs();
			vi.spyOn(fs, "existsSync").mockImplementation((target: any) => {
				const val = String(target);
				if (val.includes(".tmp-")) return true;
				return true;
			});

			await runBuild();
			expect(fs.rmSync).toHaveBeenCalled();
		});

		it("should handle esbuild throwing an Error and clean up tmpDir", async () => {
			configureBasicFs();
			vi.spyOn(esbuild, "build").mockRejectedValue(
				new Error("Compilation error"),
			);

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(fs.rmSync).toHaveBeenCalled();
			expect(loggerErrorSpy).toHaveBeenCalledWith("Build failed:");
			expect(consoleErrorSpy).toHaveBeenCalledWith("Compilation error");
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should handle esbuild throwing a non-Error value", async () => {
			configureBasicFs();
			vi.spyOn(esbuild, "build").mockRejectedValue("String failure");

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(consoleErrorSpy).toHaveBeenCalledWith("String failure");
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should handle atomic replacement failure and cleanup/restore correctly", async () => {
			configureBasicFs();
			let renameCount = 0;
			vi.spyOn(fs, "renameSync").mockImplementation(() => {
				renameCount++;
				if (renameCount === 2) {
					throw new Error("Permission denied during swap");
				}
			});
			vi.spyOn(fs, "existsSync").mockReturnValue(true);

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(loggerErrorSpy).toHaveBeenCalledWith(
				"Failed to replace production build:",
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Permission denied during swap",
			);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should handle atomic replacement failure with non-Error object", async () => {
			configureBasicFs();
			vi.spyOn(fs, "renameSync").mockImplementation(() => {
				throw "Atomic rename string error";
			});

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Atomic rename string error",
			);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("should handle atomic replacement failure when no previous directory exists", async () => {
			configureBasicFs();
			vi.spyOn(fs, "existsSync").mockImplementation((target: any) => {
				if (String(target) === outDir) return false;
				return true;
			});
			vi.spyOn(fs, "renameSync").mockImplementation(() => {
				throw new Error("Atomic rename failed");
			});

			await expect(runBuild()).rejects.toThrow("process.exit called");
			expect(consoleErrorSpy).toHaveBeenCalledWith("Atomic rename failed");
			expect(exitSpy).toHaveBeenCalledWith(1);
		});
	});

	it("should successfully run a full build cycle with static assets", async () => {
		configureBasicFs();
		vi.spyOn(fs, "readdirSync").mockReturnValue([
			file("subatom.config.ts"),
			file("notes.graphql"),
		] as any);

		await expect(runBuild()).resolves.toBeUndefined();
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			expect.stringContaining("Build complete in"),
		);
	});
});
