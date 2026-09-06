import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import * as childProcess from "node:child_process";
import { ProcessLifecycle } from "../../../start/life-cycle/ProcessLifecycle.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("node:child_process");

describe("runProcess", () => {
  let mockChild: any;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    ProcessLifecycle.resetInstanceForTesting();

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    mockChild = new EventEmitter();
    mockChild.killed = false;
    mockChild.exitCode = null;
    mockChild.kill = vi.fn();

    vi.spyOn(childProcess, "spawn").mockReturnValue(mockChild);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ProcessLifecycle.resetInstanceForTesting();
  });

  it("should spawn child process with given options", async () => {
    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    const child = runProcess("node", ["server.js"], {
      cwd: "/work",
      env: { FOO: "bar" },
      label: "worker",
    });

    expect(child).toBe(mockChild);
    expect(childProcess.spawn).toHaveBeenCalledWith("node", ["server.js"], {
      cwd: "/work",
      env: expect.objectContaining({ FOO: "bar" }),
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  });

  it("should log error and exit on non-zero child exit", async () => {
    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    runProcess("node", ["index.js"], { label: "server" });

    mockChild.emit("exit", 2, "SIGTERM");
    expect(loggerErrorSpy).toHaveBeenCalledWith("server exited with code 2 (SIGTERM)");
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("should log error and exit with 1 on spawn error event", async () => {
    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    runProcess("node", ["index.js"], { label: "server" });

    mockChild.emit("error", new Error("ENOENT"));
    expect(loggerErrorSpy).toHaveBeenCalledWith("Failed to start server: ENOENT");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should kill active child processes when ProcessLifecycle terminates", async () => {
    vi.resetModules();
    ProcessLifecycle.resetInstanceForTesting();

    const { runProcess: freshRunProcess } = await import(
      "../../../start/utils/spawnProcess.js"
    );
    const { ProcessLifecycle: freshProcessLifecycle } = await import(
      "../../../start/life-cycle/ProcessLifecycle.js"
    );

    freshRunProcess("node", ["app.js"], { label: "service" });

    const lifecycle = freshProcessLifecycle.getInstance();
    await lifecycle.handleShutdown("SIGINT");

    expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");
  });
});