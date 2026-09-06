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

  it("should exit 1 if compiled production file is missing", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    await expect(runPreview()).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No production build found")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should resolve port and start server process", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    await runPreview();

    expect(loggerSuccessSpy).toHaveBeenCalledWith("http://localhost:8080");
    expect(utils.runProcess).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining("server.js")],
      expect.objectContaining({ label: "preview server" })
    );
  });
});