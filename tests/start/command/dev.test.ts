import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runDev } from "../../../start/commands/dev.js";
import * as loadConfig from "../../../config/helpers/index.config.js";
import * as utils from "../../../start/utils/index.js";
import { ProcessManager, FrameworkWatcher } from "../../../start/watch/index.js";
import { ProcessLifecycle } from "../../../start/life-cycle/ProcessLifecycle.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("../../../config/helpers/index.config.js");

let watcherInstance: any;
let managerInstance: any;

vi.mock("../../../start/watch/index.js", () => {
  return {
    ProcessManager: vi.fn().mockImplementation(function (this: any) {
      this.start = vi.fn();
      this.restart = vi.fn().mockResolvedValue(undefined);
      this.stop = vi.fn().mockResolvedValue(undefined);
      managerInstance = this;
      return this;
    }),
    FrameworkWatcher: vi.fn().mockImplementation(function (this: any, opts: any) {
      this.options = opts;
      this.start = vi.fn().mockResolvedValue(undefined);
      this.close = vi.fn().mockResolvedValue(undefined);
      watcherInstance = this;
      return this;
    }),
  };
});

describe("runDev", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let loggerInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ProcessLifecycle.resetInstanceForTesting();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    loggerInfoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

    vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
      entry: "src/index.ts",
      port: 3000,
    } as any);

    vi.spyOn(utils, "resolveEntry").mockReturnValue("/app/src/index.ts");
    vi.spyOn(process, "cwd").mockReturnValue("/app");
  });

  afterEach(() => {
    ProcessLifecycle.resetInstanceForTesting();
    vi.restoreAllMocks();
  });

  it("should exit 1 if port is NaN", async () => {
    await expect(runDev({ port: "invalid-port" })).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith('Invalid port: "invalid-port"');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should exit 1 if resolveEntry fails with Error and non-Error", async () => {
    vi.spyOn(utils, "resolveEntry").mockImplementation(() => {
      throw new Error("Entry missing");
    });

    await expect(runDev({})).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith("Entry missing");
    expect(exitSpy).toHaveBeenCalledWith(1);

    vi.spyOn(utils, "resolveEntry").mockImplementation(() => {
      throw "Raw entry error";
    });
    await expect(runDev({})).rejects.toThrow("process.exit called");
    expect(loggerErrorSpy).toHaveBeenCalledWith("Raw entry error");
  });

  it("should default host and port when omitted from options and config", async () => {
    vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
      entry: "src/index.ts",
    } as any);

    await runDev({});

    expect(ProcessManager).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({ PORT: "8080", HOST: "localhost" }),
      })
    );
  });

  it("should handle watcher onChange (single file and batched files) and onError", async () => {
    await runDev({ port: "4000", host: "0.0.0.0" });

    const watcherOptions = watcherInstance.options;

    // Single file change
    watcherOptions.onChange("/app/src/index.ts", [{ path: "/app/src/index.ts" }]);
    expect(managerInstance.restart).toHaveBeenCalledWith("src/index.ts");

    // Batched files change
    watcherOptions.onChange("/app/src/index.ts", [
      { path: "/app/src/index.ts" },
      { path: "/app/src/utils.ts" },
    ]);
    expect(managerInstance.restart).toHaveBeenCalledWith("2 files (src/index.ts and others)");

    // Error callback
    watcherOptions.onError(new Error("Watcher failed"));
    expect(loggerErrorSpy).toHaveBeenCalledWith("Watcher error: Watcher failed");
  });

it("should register and invoke lifecycle shutdown callback", async () => {
    exitSpy.mockImplementation((() => {}) as any);
    await runDev({ port: "4000" });

    const lifecycle = ProcessLifecycle.getInstance();
    await lifecycle.handleShutdown("SIGTERM");

    expect(loggerInfoSpy).toHaveBeenCalledWith("Shutting down dev server...");
    expect(watcherInstance.close).toHaveBeenCalled();
    expect(managerInstance.stop).toHaveBeenCalled();
  });
});