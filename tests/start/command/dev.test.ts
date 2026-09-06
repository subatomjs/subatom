import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runDev } from "../../../start/commands/dev.js";
import * as loadConfig from "../../../config/helpers/index.config.js";
import * as utils from "../../../start/utils/index.js";
import { ProcessManager, FrameworkWatcher } from "../../../start/watch/index.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("../../../config/helpers/index.config.js");
vi.mock("../../../start/watch/index.js", () => {
  return {
    ProcessManager: vi.fn().mockImplementation(function (this: any) {
      this.start = vi.fn();
      this.restart = vi.fn();
      this.stop = vi.fn();
      return this;
    }),
    FrameworkWatcher: vi.fn().mockImplementation(function (this: any) {
      this.start = vi.fn().mockResolvedValue(undefined);
      this.close = vi.fn().mockResolvedValue(undefined);
      return this;
    }),
  };
});

describe("runDev", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
      entry: "src/index.ts",
      port: 3000,
    } as any);

    vi.spyOn(utils, "resolveEntry").mockReturnValue("/app/src/index.ts");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should exit 1 if port is NaN", async () => {
    await expect(runDev({ port: "invalid-port" })).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith('Invalid port: "invalid-port"');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should exit 1 if resolveEntry fails", async () => {
    vi.spyOn(utils, "resolveEntry").mockImplementation(() => {
      throw new Error("Entry missing");
    });

    await expect(runDev({})).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith("Entry missing");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should initialize ProcessManager and FrameworkWatcher with correct paths", async () => {
    await runDev({ port: "4000", host: "0.0.0.0" });

    expect(ProcessManager).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "dev server",
        env: expect.objectContaining({ PORT: "4000", HOST: "0.0.0.0" }),
      })
    );
    expect(FrameworkWatcher).toHaveBeenCalled();
  });
});