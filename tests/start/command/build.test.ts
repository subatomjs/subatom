/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import * as esbuild from "esbuild";
import { runBuild } from "../../../start/commands/build.js";
import * as loadConfig from "../../../config/helpers/load.config.js";
import * as utils from "../../../start/utils/index.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("node:fs");
vi.mock("esbuild");
vi.mock("../../../config/helpers/load.config.js");

describe("runBuild", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
	let loggerSuccessSpy: ReturnType<typeof vi.spyOn>;
	let loggerInfoSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit called");
		}) as any);
		loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
		loggerSuccessSpy = vi.spyOn(logger, "success").mockImplementation(() => {});
		loggerInfoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});

		vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
			entry: "src/index.ts",
			outDir: "dist",
		} as any);

		vi.spyOn(utils, "readUserPackageJson").mockReturnValue({ type: "module" });
		vi.spyOn(utils, "resolveEntry").mockReturnValue("/mock/cwd/src/index.ts");
		vi.spyOn(process, "cwd").mockReturnValue("/mock/cwd");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should exit 1 when entry resolution fails with Error and non-Error", async () => {
		vi.spyOn(utils, "resolveEntry").mockImplementation(() => {
			throw new Error("Resolution failed");
		});

		await expect(runBuild()).rejects.toThrow("process.exit called");
		expect(loggerErrorSpy).toHaveBeenCalledWith("Resolution failed");
		expect(exitSpy).toHaveBeenCalledWith(1);

		vi.spyOn(utils, "resolveEntry").mockImplementation(() => {
			throw "Raw string error";
		});

		await expect(runBuild()).rejects.toThrow("process.exit called");
		expect(loggerErrorSpy).toHaveBeenCalledWith("Raw string error");
	});

	it("should handle root entry file when path.dirname(relativeEntry) is empty", async () => {
		vi.spyOn(utils, "resolveEntry").mockReturnValue("/mock/cwd/index.ts");
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "readdirSync").mockReturnValue(["index.ts"] as any);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);
		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
		vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

		await runBuild();
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			expect.stringContaining("Compiled 1 source file successfully."),
		);
	});

	it("should exit 1 when source directory does not exist", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(false);

		await expect(runBuild()).rejects.toThrow("process.exit called");
		expect(loggerErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Source directory not found"),
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("should walk nested directories and skip node_modules and dot-directories", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "readdirSync").mockImplementation((dir) => {
			if (String(dir).endsWith("src")) {
				return ["sub", "node_modules", ".git", "index.ts"] as any;
			}
			if (String(dir).endsWith("sub")) {
				return ["nested.ts", "schema.json", "data.txt"] as any;
			}
			return [] as any;
		});

		vi.spyOn(fs, "statSync").mockImplementation((p) => {
			const isDir =
				String(p).endsWith("sub") ||
				String(p).endsWith("node_modules") ||
				String(p).endsWith(".git");
			return { isDirectory: () => isDir } as any;
		});

		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		vi.spyOn(fs, "copyFileSync").mockReturnValue(undefined);
		vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
		vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

		await runBuild();

		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			expect.stringContaining("Copied 2 assets successfully."),
		);
	});

	it("should exit 1 if no source files are discovered", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "readdirSync").mockReturnValue([] as any);

		await expect(runBuild()).rejects.toThrow("process.exit called");
		expect(loggerErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("No TypeScript/JavaScript source files found"),
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("should support CommonJS package format, minify, and sourcemap overrides", async () => {
		vi.spyOn(utils, "readUserPackageJson").mockReturnValue({
			type: "commonjs",
		});
		vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
			entry: "src/index.ts",
			outDir: "dist",
			sourcemap: false,
			minify: true,
		} as any);

		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "readdirSync").mockReturnValue([
			"index.ts",
			"asset.json",
		] as any);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);
		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		vi.spyOn(fs, "copyFileSync").mockReturnValue(undefined);
		vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
		vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

		await runBuild();

		expect(esbuild.build).toHaveBeenCalledWith(
			expect.objectContaining({
				bundle: false,
				format: "cjs",
				sourcemap: false,
				minify: true,
			}),
		);
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			expect.stringContaining("Copied 1 asset successfully."),
		);
	});
	it("should revert atomic backup and restore previous build when rename fails", async () => {
		vi.spyOn(fs, "existsSync").mockImplementation(
			(p) => String(p).endsWith("dist") || String(p).endsWith("src"),
		);
		vi.spyOn(fs, "readdirSync").mockReturnValue(["index.ts"] as any);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);
		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

		let renameCount = 0;
		const renameMock = vi.spyOn(fs, "renameSync").mockImplementation(() => {
			renameCount++;
			if (renameCount === 2) {
				throw new Error("Disk locked");
			}
		});

		await expect(runBuild()).rejects.toThrow("Disk locked");
		expect(renameMock).toHaveBeenCalledTimes(3); // 1: outDir->backup, 2: tmp->out (fails), 3: backup->outDir
	});

	it("should atomic replace cleanly when outDir did not exist initially", async () => {
		vi.spyOn(fs, "existsSync").mockImplementation(
			(p) => !String(p).endsWith("dist"),
		);
		vi.spyOn(fs, "readdirSync").mockReturnValue(["index.ts"] as any);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);
		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		const renameMock = vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
		vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

		await runBuild();
		expect(renameMock).toHaveBeenCalledTimes(1);
	});

	it("should atomic replace cleanly when outDir did not exist initially", async () => {
		vi.spyOn(fs, "existsSync").mockImplementation(
			(p) => !String(p).endsWith("dist"),
		);
		vi.spyOn(fs, "readdirSync").mockReturnValue(["index.ts"] as any);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);
		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
		vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

		await runBuild();
		expect(fs.renameSync).toHaveBeenCalledTimes(1);
	});

	it("should remove tmpDir and exit 1 on build failure with Error and string", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "readdirSync").mockReturnValue(["index.ts"] as any);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);
		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		const rmSpy = vi.spyOn(fs, "rmSync").mockReturnValue(undefined);

		vi.spyOn(esbuild, "build").mockRejectedValue(new Error("Syntax error"));

		await expect(runBuild()).rejects.toThrow("process.exit called");
		expect(rmSpy).toHaveBeenCalled();
		expect(loggerErrorSpy).toHaveBeenCalledWith("Build failed:");
		expect(exitSpy).toHaveBeenCalledWith(1);

		vi.spyOn(esbuild, "build").mockRejectedValue("Plain failure string");
		await expect(runBuild()).rejects.toThrow("process.exit called");
	});

	it("should format plural source and singular static logs", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "readdirSync").mockImplementation(
			() => ["a.ts", "b.ts", "data.json"] as any,
		);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);
		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		vi.spyOn(fs, "copyFileSync").mockReturnValue(undefined);
		vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
		vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

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

	it("should fallback to dot when relativeEntry.split returns empty", async () => {
		vi.spyOn(utils, "resolveEntry").mockReturnValue("/mock/cwd");
		vi.spyOn(fs, "existsSync").mockReturnValue(false);

		await expect(runBuild()).rejects.toThrow("process.exit called");
	});

	it("should log singular source and static asset counts", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "readdirSync").mockReturnValue([
			"index.ts",
			"data.json",
		] as any);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);
		vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
		vi.spyOn(fs, "copyFileSync").mockReturnValue(undefined);
		vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
		vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
		vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

		await runBuild();

		expect(loggerInfoSpy).toHaveBeenCalledWith("Building 1 source file...");
		expect(loggerInfoSpy).toHaveBeenCalledWith("Copying 1 asset...");
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			"Compiled 1 source file successfully.",
		);
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			"Copied 1 asset successfully.",
		);
	});
});
