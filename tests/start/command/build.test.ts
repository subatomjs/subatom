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

  it("should exit 1 when entry resolution fails", async () => {
    vi.spyOn(utils, "resolveEntry").mockImplementation(() => {
      throw new Error("Resolution failed");
    });

    await expect(runBuild()).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith("Resolution failed");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should exit 1 when source directory does not exist", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    await expect(runBuild()).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Source directory not found")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should exit 1 if no source files are discovered", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue([] as any);

    await expect(runBuild()).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No TypeScript/JavaScript source files found")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should compile typescript and copy static files on success", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    vi.spyOn(fs, "readdirSync").mockImplementation((dir) => {
      if (String(dir).endsWith("src")) return ["index.ts", "schema.json"] as any;
      return [] as any;
    });

    vi.spyOn(fs, "statSync").mockImplementation(() => ({
      isDirectory: () => false,
    } as any));

    vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
    vi.spyOn(fs, "copyFileSync").mockReturnValue(undefined);
    vi.spyOn(fs, "renameSync").mockReturnValue(undefined);
    vi.spyOn(fs, "rmSync").mockReturnValue(undefined);
    vi.spyOn(esbuild, "build").mockResolvedValue({} as any);

    await runBuild();

    expect(esbuild.build).toHaveBeenCalledWith(
      expect.objectContaining({
        bundle: false,
        format: "esm",
      })
    );
    expect(fs.copyFileSync).toHaveBeenCalled();
    expect(loggerSuccessSpy).toHaveBeenCalledWith(
      expect.stringContaining("Build complete in")
    );
  });

  it("should revert atomic backup and exit on build failure", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue(["index.ts"] as any);
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false } as any);
    vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as any);
    vi.spyOn(fs, "rmSync").mockReturnValue(undefined);

    vi.spyOn(esbuild, "build").mockRejectedValue(new Error("Syntax error"));

    await expect(runBuild()).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith("Build failed:");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});