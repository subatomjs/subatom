/// <reference types="node" />



import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import * as childProcess from "node:child_process";
import { ProcessManager } from "../../../start/watch/ProcessManager.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("node:child_process");

describe("ProcessManager", () => {
  let mockChild: any;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let loggerInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    loggerInfoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

    mockChild = new EventEmitter();
    mockChild.pid = 9999;
    mockChild.killed = false;
    mockChild.exitCode = null;

    vi.spyOn(childProcess, "spawn").mockImplementation((cmd) => {
      if (cmd === "pkill" || cmd === "taskkill") {
        const killer = new EventEmitter() as any;
        process.nextTick(() => killer.emit("close"));
        return killer;
      }
      return mockChild;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should start a child process and report active status", () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "app-server",
    });

    pm.start();
    expect(pm.getStatus().isRunning).toBe(true);
    expect(pm.getStatus().pid).toBe(9999);
  });

  it("should log errors when process exits with a non-zero code", () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "app-server",
    });

    pm.start();
    mockChild.emit("exit", 1);

    expect(loggerErrorSpy).toHaveBeenCalledWith("app-server crashed (exit code 1)");
    expect(pm.getStatus().isRunning).toBe(false);
  });

  it("should log errors on spawn error event", () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "app-server",
    });

    pm.start();
    mockChild.emit("error", new Error("EACCES"));

    expect(loggerErrorSpy).toHaveBeenCalledWith("Failed to start app-server: EACCES");
    expect(pm.getStatus().isRunning).toBe(false);
  });

  it("should restart running process and handle coalesced triggers", async () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "dev-server",
    });

    pm.start();

    const firstRestart = pm.restart("app.ts changed");
    const secondRestart = pm.restart("routes.ts changed");

    await Promise.all([firstRestart, secondRestart]);

    expect(loggerInfoSpy).toHaveBeenCalledWith("File changed: app.ts changed");
    expect(loggerInfoSpy).toHaveBeenCalledWith("File changed: routes.ts changed");
  });

  it("should stop child processes and dispose gracefully", async () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "dev-server",
    });

    pm.start();
    await pm.stop();

    expect(pm.getStatus().isDisposed).toBe(true);
    expect(pm.getStatus().isRunning).toBe(false);
  });
});