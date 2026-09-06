import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import * as childProcess from "node:child_process";
import { ProcessLifecycle } from "../../../start/life-cycle/ProcessLifecycle.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("node:child_process");
vi.mock("../../../start/utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("runProcess", () => {
  let mockChild: any;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    mockChild = new EventEmitter();
    mockChild.killed = false;
    mockChild.exitCode = null;
    mockChild.kill = vi.fn();

    vi.spyOn(childProcess, "spawn").mockImplementation(() => mockChild);
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

  it("should handle normal exit with code 0 and code null without exiting main process", async () => {
    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    runProcess("node", ["index.js"], { label: "server" });

    mockChild.emit("exit", 0, null);
    expect(exitSpy).not.toHaveBeenCalled();

    mockChild.emit("exit", null, "SIGKILL");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("should log error and exit on non-zero child exit with signal", async () => {
    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    runProcess("node", ["index.js"], { label: "server" });

    mockChild.emit("exit", 2, "SIGTERM");
    expect(logger.error).toHaveBeenCalledWith("server exited with code 2 (SIGTERM)");
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("should log error and exit on non-zero child exit without signal", async () => {
    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    runProcess("node", ["index.js"], { label: "server" });

    mockChild.emit("exit", 3, null);
    expect(logger.error).toHaveBeenCalledWith("server exited with code 3");
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it("should log error and exit with 1 on spawn error event", async () => {
    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    runProcess("node", ["index.js"], { label: "server" });

    mockChild.emit("error", new Error("ENOENT"));
    expect(logger.error).toHaveBeenCalledWith("Failed to start server: ENOENT");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should kill active child processes when ProcessLifecycle terminates with Error or fallback signal", async () => {
    vi.resetModules();
    ProcessLifecycle.resetInstanceForTesting();

    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    const { ProcessLifecycle: FreshLifecycle } = await import("../../../start/life-cycle/ProcessLifecycle.js");

    runProcess("node", ["app.js"], { label: "service" });

    mockChild.kill.mockImplementation(() => {
      throw new Error("Process already dead");
    });

    const lifecycle = FreshLifecycle.getInstance();
    await lifecycle.handleShutdown(new Error("Crash shutdown"));

    expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("should send SIGINT to child if shutdown signal is SIGINT", async () => {
    vi.resetModules();
    ProcessLifecycle.resetInstanceForTesting();

    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    const { ProcessLifecycle: FreshLifecycle } = await import("../../../start/life-cycle/ProcessLifecycle.js");

    runProcess("node", ["app.js"], { label: "service" });

    const lifecycle = FreshLifecycle.getInstance();
    await lifecycle.handleShutdown("SIGINT");

    expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");
  });

  it("should skip children that already exited during shutdown", async () => {
    vi.resetModules();
    ProcessLifecycle.resetInstanceForTesting();

    const { runProcess } = await import("../../../start/utils/spawnProcess.js");
    const { ProcessLifecycle: FreshLifecycle } = await import("../../../start/life-cycle/ProcessLifecycle.js");

    runProcess("node", ["app.js"], { label: "service" });
    mockChild.exitCode = 0;

    await FreshLifecycle.getInstance().handleShutdown("SIGTERM");

    expect(mockChild.kill).not.toHaveBeenCalled();
  });
});