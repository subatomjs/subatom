import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { runPreview } from "../../../start/commands/preview.js";
import * as loadConfig from "../../../config/helpers/load.config.js";
import * as utils from "../../../start/utils/index.js";
import * as resolveEntryModule from "../../../start/utils/resolveEntry.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("node:fs");
vi.mock("../../../config/helpers/load.config.js");

describe("runPreview", () => {
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

    vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
      entry: "src/server.ts",
      outDir: "dist",
    } as any);

    vi.spyOn(resolveEntryModule, "resolveEntry").mockReturnValue("/workspace/src/server.ts");
    vi.spyOn(utils, "resolveEntry").mockReturnValue("/workspace/src/server.ts");
    vi.spyOn(process, "cwd").mockReturnValue("/workspace");
    vi.spyOn(utils, "resolvePort").mockResolvedValue(8080);
    vi.spyOn(utils, "runProcess").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should exit 1 if resolveEntry throws Error or non-Error", async () => {
    vi.spyOn(resolveEntryModule, "resolveEntry").mockImplementation(() => {
      throw new Error("Missing entry point");
    });

    await expect(runPreview()).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith("Missing entry point");

    vi.spyOn(resolveEntryModule, "resolveEntry").mockImplementation(() => {
      throw "Primitive error";
    });
    await expect(runPreview()).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith("Primitive error");
  });

  it("should exit 1 if compiled production file is missing", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    await expect(runPreview()).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No production build found")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should resolve port and start server with default config and localhost protocol", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
      entry: "src/server.ts",
    } as any);
    vi.spyOn(resolveEntryModule, "resolveEntry").mockReturnValue("/workspace/src/server.ts");

    await runPreview();

    expect(loggerSuccessSpy).toHaveBeenCalledWith("http://localhost:8080");
    expect(utils.runProcess).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining("server.js")],
      expect.objectContaining({ label: "preview server" })
    );
  });

  it("should use https protocol when host is not localhost", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
      entry: "src/server.ts",
      host: "custom.domain",
      port: 3000,
    } as any);
    vi.spyOn(utils, "resolvePort").mockResolvedValue(3000);

    await runPreview();

    expect(loggerSuccessSpy).toHaveBeenCalledWith("https://custom.domain:3000");
  });

  it("should resolve compiled path when entry is configured with outDir", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(resolveEntryModule, "resolveEntry").mockReturnValue("/workspace/src/index.ts");
    vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
      entry: "src/index.ts",
      outDir: "dist",
    } as any);

    await runPreview();

    expect(utils.runProcess).toHaveBeenCalledWith(
      process.execPath,
      ["/workspace/dist/index.js"],
      expect.anything()
    );
  });

  it("should resolve a compiled root-level entry relative to cwd", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(resolveEntryModule, "resolveEntry").mockReturnValue("/workspace/index.ts");
    vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
      entry: "index.ts",
    } as any);

    await runPreview();

    expect(utils.runProcess).toHaveBeenCalledWith(
      process.execPath,
      ["/workspace/dist"],
      expect.objectContaining({ label: "preview server" }),
    );
  });
});