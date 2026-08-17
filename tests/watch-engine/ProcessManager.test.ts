import { EventEmitter } from "node:events";

import * as childProcess from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../package/watch-engine/utils/logger.js";
import { ProcessManager } from "../../package/watch-engine/watch/ProcessManager.js";
import type { ProcessManagerOptions } from "../../package/types/engine-utils/WatchConfig.js";

// Mock child_process and logger
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("../../package/watch-engine/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("ProcessManager", () => {
  let defaultOpts: ProcessManagerOptions;
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    defaultOpts = {
      command: "node",
      args: ["dist/index.js"],
      cwd: "/app",
      env: { NODE_ENV: "development" },
      label: "Subatom Server",
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  function createMockChildProcess(overrides: Partial<any> = {}) {
    const emitter = new EventEmitter() as any;
    emitter.pid = 12345;
    emitter.killed = false;
    emitter.exitCode = null;

    vi.spyOn(emitter, "removeAllListeners");

    Object.assign(emitter, overrides);
    return emitter;
  }

  // ---------------------------------------------------------------------------
  // 1. Initial State & getStatus()
  // ---------------------------------------------------------------------------
  describe("getStatus()", () => {
    it("returns correct initial idle status", () => {
      const pm = new ProcessManager(defaultOpts);
      expect(pm.getStatus()).toEqual({
        isRunning: false,
        isRestarting: false,
        isDisposed: false,
        pid: undefined,
      });
    });

    it("reflects active running state after start()", () => {
      const mockChild = createMockChildProcess({ pid: 999 });
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      expect(pm.getStatus()).toEqual({
        isRunning: true,
        isRestarting: false,
        isDisposed: false,
        pid: 999,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. start() Lifecycle & Guards
  // ---------------------------------------------------------------------------
  describe("start()", () => {
    it("spawns a child process with provided options and merges env vars", () => {
      const mockChild = createMockChildProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "node",
        ["dist/index.js"],
        expect.objectContaining({
          cwd: "/app",
          env: expect.objectContaining({ NODE_ENV: "development" }),
          stdio: "inherit",
        }),
      );
    });

    it("does nothing if already disposed", async () => {
      const pm = new ProcessManager(defaultOpts);
      await pm.stop();
      pm.start();

      expect(childProcess.spawn).not.toHaveBeenCalled();
    });

    it("does nothing if already running with an active process", () => {
      const mockChild = createMockChildProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();
      pm.start(); // Second call

      expect(childProcess.spawn).toHaveBeenCalledTimes(1);
    });

    it("logs error when process crashes with non-zero exit code", () => {
      const mockChild = createMockChildProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      // Emit crash exit code
      mockChild.emit("exit", 1);

      expect(logger.error).toHaveBeenCalledWith(
        "Subatom Server crashed (exit code 1)",
      );
      expect(pm.getStatus().isRunning).toBe(false);
    });

    it("does not log error if process exits cleanly with code 0 or null", () => {
      const mockChild1 = createMockChildProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild1);

      const pm = new ProcessManager(defaultOpts);
      pm.start();
      mockChild1.emit("exit", 0);

      const mockChild2 = createMockChildProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild2);
      pm.start();
      mockChild2.emit("exit", null);

      expect(logger.error).not.toHaveBeenCalled();
    });

    it("logs error when spawn encounters an error", () => {
      const mockChild = createMockChildProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      mockChild.emit("error", new Error("spawn ENOENT"));

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to start Subatom Server: spawn ENOENT",
      );
      expect(pm.getStatus().isRunning).toBe(false);
    });

    it("does not log error if exit or error occurs after disposal", async () => {
      const mockChild = createMockChildProcess({ pid: undefined });
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      await pm.stop();

      // Add a dummy error handler so EventEmitter doesn't throw unhandled error in Node
      mockChild.on("error", () => {});

      mockChild.emit("exit", 1);
      mockChild.emit("error", new Error("Some error"));

      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. restart() & Queued Restart Behavior
  // ---------------------------------------------------------------------------
  describe("restart()", () => {
    it("logs file change reason, terminates previous child, and restarts", async () => {
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation(() => true as any);
      const mockChild1 = createMockChildProcess({ pid: 100 });
      const mockChild2 = createMockChildProcess({ pid: 200 });

      vi.mocked(childProcess.spawn)
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      const restartPromise = pm.restart("src/index.ts");
      await vi.advanceTimersByTimeAsync(50);
      await restartPromise;

      expect(logger.info).toHaveBeenCalledWith("File changed: src/index.ts");
      expect(mockChild1.removeAllListeners).toHaveBeenCalled();
      expect(killSpy).toHaveBeenCalledWith(100, "SIGKILL");
      expect(childProcess.spawn).toHaveBeenCalledTimes(2);
      expect(pm.getStatus().pid).toBe(200);
    });

    it("queues and triggers subsequent restart if called while already restarting", async () => {
      vi.spyOn(process, "kill").mockImplementation(() => true as any);
      const mockChild1 = createMockChildProcess({ pid: 101 });
      const mockChild2 = createMockChildProcess({ pid: 102 });
      const mockChild3 = createMockChildProcess({ pid: 103 });

      vi.mocked(childProcess.spawn)
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2)
        .mockReturnValueOnce(mockChild3);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      // Trigger first restart (sets restarting = true)
      const firstRestart = pm.restart("change-1.ts");

      // Trigger second restart while first is in-flight (should be queued)
      const secondRestart = pm.restart("change-2.ts");

      await vi.advanceTimersByTimeAsync(100);
      await firstRestart;
      await secondRestart;

      // Ensure second queued reason was logged
      expect(logger.info).toHaveBeenCalledWith("File changed: change-1.ts");
      expect(logger.info).toHaveBeenCalledWith("File changed: change-2.ts");
      expect(childProcess.spawn).toHaveBeenCalledTimes(3);
    });

    it("uses fallback 'queued change' reason when secondary restart has no reason provided", async () => {
      vi.spyOn(process, "kill").mockImplementation(() => true as any);
      const mockChild1 = createMockChildProcess({ pid: 201 });
      const mockChild2 = createMockChildProcess({ pid: 202 });

      vi.mocked(childProcess.spawn)
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      const firstRestart = pm.restart();
      pm.restart(); // No reason passed -> sets restartQueuedReason = "queued change"

      await vi.advanceTimersByTimeAsync(100);
      await firstRestart;

      expect(logger.info).toHaveBeenCalledWith("File changed: queued change");
    });

    it("aborts restart if disposed", async () => {
      const pm = new ProcessManager(defaultOpts);
      await pm.stop();

      await pm.restart("src/app.ts");
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. killChildProcess() - POSIX vs Windows Platform Branches & Error Handling
  // ---------------------------------------------------------------------------
  describe("killChildProcess (via stop / restart)", () => {
    it("resolves immediately if child is already dead, killed, or has no PID", async () => {
      const pm = new ProcessManager(defaultOpts);

      // Case A: killed = true
      const deadChild1 = createMockChildProcess({ killed: true, pid: 111 });
      vi.mocked(childProcess.spawn).mockReturnValue(deadChild1);
      pm.start();
      await pm.stop();

      // Case B: exitCode !== null
      const deadChild2 = createMockChildProcess({ exitCode: 0, pid: 222 });
      vi.mocked(childProcess.spawn).mockReturnValue(deadChild2);
      pm.start();
      await pm.stop();

      // Case C: pid === undefined
      const deadChild3 = createMockChildProcess({ pid: undefined });
      vi.mocked(childProcess.spawn).mockReturnValue(deadChild3);
      pm.start();
      await pm.stop();

      expect(childProcess.execSync).not.toHaveBeenCalled();
    });

    it("terminates via taskkill on Windows (win32)", async () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      const mockChild = createMockChildProcess({ pid: 54321 });
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      const stopPromise = pm.stop();
      await vi.advanceTimersByTimeAsync(50);
      await stopPromise;

      expect(childProcess.execSync).toHaveBeenCalledWith(
        "taskkill /pid 54321 /T /F",
        { stdio: "ignore" },
      );
    });

    it("safely catches and suppresses errors if taskkill on Windows fails", async () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error("Process not found");
      });

      const mockChild = createMockChildProcess({ pid: 54321 });
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      const stopPromise = pm.stop();
      await vi.advanceTimersByTimeAsync(50);
      await expect(stopPromise).resolves.toBeUndefined();
    });

    it("terminates via pkill and process.kill on POSIX systems", async () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation(() => true as any);
      const mockChild = createMockChildProcess({ pid: 8888 });
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      const stopPromise = pm.stop();
      await vi.advanceTimersByTimeAsync(50);
      await stopPromise;

      expect(childProcess.execSync).toHaveBeenCalledWith("pkill -9 -P 8888", {
        stdio: "ignore",
      });
      expect(killSpy).toHaveBeenCalledWith(8888, "SIGKILL");
    });

    it("safely catches and suppresses errors when POSIX pkill or process.kill throws", async () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });

      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error("No matching processes");
      });
      vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("ESRCH: No such process");
      });

      const mockChild = createMockChildProcess({ pid: 7777 });
      vi.mocked(childProcess.spawn).mockReturnValue(mockChild);

      const pm = new ProcessManager(defaultOpts);
      pm.start();

      const stopPromise = pm.stop();
      await vi.advanceTimersByTimeAsync(50);
      await expect(stopPromise).resolves.toBeUndefined();
    });
  });
});
