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
    mockChild.removeAllListeners = vi.fn();

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

  it("should start a child process and report active status, ignoring redundant start() calls", () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "app-server",
    });

    pm.start();
    expect(pm.getStatus().isRunning).toBe(true);
    expect(pm.getStatus().pid).toBe(9999);

    pm.start();
    expect(pm.getStatus().isRunning).toBe(true);
  });

  it("should ignore start and restart when disposed", async () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "app-server",
    });

    await pm.stop();
    expect(pm.getStatus().isDisposed).toBe(true);

    pm.start();
    await pm.restart();
    expect(pm.getStatus().isRunning).toBe(false);
  });

  it("should ignore exit and error events when manager is disposed", async () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "app-server",
    });

    pm.start();
    const child = (pm as any).child;
    await pm.stop();

    child.emit("exit", 1);
    child.emit("error", new Error("Late child error"));

    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it("should not log crash error if child exits with code 0 or null", () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "app-server",
    });

    pm.start();
    mockChild.emit("exit", 0);
    mockChild.emit("exit", null);

    expect(loggerErrorSpy).not.toHaveBeenCalled();
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

  it("should restart running process without reason and handle coalesced triggers", async () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "dev-server",
    });

    pm.start();

    const firstRestart = pm.restart();
    const secondRestart = pm.restart();

    await Promise.all([firstRestart, secondRestart]);
    expect(pm.getStatus().isRunning).toBe(true);
  });

  it("should kill child with taskkill when running on Windows platform", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    try {
      const pm = new ProcessManager({
        command: "node",
        args: ["entry.js"],
        cwd: "/app",
        label: "dev-server",
      });

      pm.start();
      await pm.stop();
      expect(pm.getStatus().isDisposed).toBe(true);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("should handle error event from killer spawn process safely", async () => {
    vi.spyOn(childProcess, "spawn").mockImplementation((cmd) => {
      if (cmd === "pkill") {
        const killer = new EventEmitter() as any;
        process.nextTick(() => killer.emit("error", new Error("pkill failed")));
        return killer;
      }
      return mockChild;
    });

    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "dev-server",
    });

    pm.start();
    await pm.stop();
    expect(pm.getStatus().isDisposed).toBe(true);
  });

  it("should resolve immediately if child is already killed or missing pid", async () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "dev-server",
    });

    pm.start();
    mockChild.killed = true;
    await pm.stop();
    expect(pm.getStatus().isDisposed).toBe(true);
  });

  it("should catch and ignore errors from process.kill during shutdown", async () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("ESRCH: No such process");
    });

    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "dev-server",
    });

    pm.start();
    await pm.stop();

    expect(killSpy).toHaveBeenCalled();
    expect(pm.getStatus().isDisposed).toBe(true);
  });

  it("should stop and clear an active child process", async () => {
    const pm = new ProcessManager({
      command: "node",
      args: ["entry.js"],
      cwd: "/app",
      label: "dev-server",
    });

    pm.start();
    await pm.stop();

    expect(mockChild.removeAllListeners).toHaveBeenCalled();
    expect(pm.getStatus()).toEqual({
      isRunning: false,
      isRestarting: false,
      isDisposed: true,
      pid: undefined,
    });
  });
});