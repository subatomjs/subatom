/// <reference types="node" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProcessLifecycle } from "../../../start/life-cycle/ProcessLifecycle.js";
import { logger } from "../../../start/utils/logger.js";

describe("ProcessLifecycle", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ProcessLifecycle.resetInstanceForTesting();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    ProcessLifecycle.resetInstanceForTesting();
    vi.restoreAllMocks();
  });

  it("should behave as a singleton and ignore secondary initialize() calls", () => {
    const a = ProcessLifecycle.getInstance();
    const b = ProcessLifecycle.getInstance();
    expect(a).toBe(b);

    a.initialize();
    a.initialize(); // Covers early return when isInitialized is true
  });

  it("should trigger shutdown when SIGINT and SIGTERM events fire", () => {
    const lifecycle = ProcessLifecycle.getInstance();
    const handleShutdownSpy = vi.spyOn(lifecycle, "handleShutdown").mockImplementation(async () => {});
    lifecycle.initialize();

    process.emit("SIGINT", "SIGINT");
    expect(handleShutdownSpy).toHaveBeenCalledWith("SIGINT");

    process.emit("SIGTERM", "SIGTERM");
    expect(handleShutdownSpy).toHaveBeenCalledWith("SIGTERM");
  });

  it("should register shutdown hooks and trigger them on exit", async () => {
    const lifecycle = ProcessLifecycle.getInstance();
    const hookA = vi.fn().mockResolvedValue(undefined);
    const hookB = vi.fn().mockResolvedValue(undefined);

    lifecycle.onShutdown(hookA);
    lifecycle.onShutdown(hookB);

    await lifecycle.handleShutdown("SIGTERM");

    expect(hookA).toHaveBeenCalledWith("SIGTERM");
    expect(hookB).toHaveBeenCalledWith("SIGTERM");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should allow unregistering hooks", async () => {
    const lifecycle = ProcessLifecycle.getInstance();
    const hook = vi.fn();

    const reg = lifecycle.onShutdown(hook);
    reg.unregister();

    await lifecycle.handleShutdown("SIGINT");
    expect(hook).not.toHaveBeenCalled();
  });

  it("should safely continue when a shutdown hook throws an Error or non-Error", async () => {
    const lifecycle = ProcessLifecycle.getInstance();
    const failingHook1 = vi.fn().mockRejectedValue(new Error("Hook failed"));
    const failingHook2 = vi.fn().mockRejectedValue("String failure");
    const succeedingHook = vi.fn();

    lifecycle.onShutdown(failingHook1);
    lifecycle.onShutdown(failingHook2);
    lifecycle.onShutdown(succeedingHook);

    await lifecycle.handleShutdown();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error during lifecycle shutdown hook: Hook failed")
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error during lifecycle shutdown hook: String failure")
    );
    expect(succeedingHook).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should exit with code 1 when signalOrError is an Error", async () => {
    const lifecycle = ProcessLifecycle.getInstance();
    const error = new Error("Fatal crash");

    await lifecycle.handleShutdown(error);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should prevent multiple concurrent shutdowns", async () => {
    const lifecycle = ProcessLifecycle.getInstance();
    const hook = vi.fn();
    lifecycle.onShutdown(hook);

    const first = lifecycle.handleShutdown("SIGINT");
    const second = lifecycle.handleShutdown("SIGINT");

    await Promise.all([first, second]);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("should listen to process uncaughtException", () => {
    const lifecycle = ProcessLifecycle.getInstance();
    lifecycle.initialize();

    const err = new Error("Exception thrown");
    process.emit("uncaughtException", err);
    expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Uncaught Exception:"));
  });

it("should listen to process unhandledRejection with an Error instance", () => {
    const lifecycle = ProcessLifecycle.getInstance();
    lifecycle.initialize();

    const handledPromise = Promise.resolve();
    process.emit("unhandledRejection", new Error("Error rejected"), handledPromise);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Unhandled Rejection:.*Error rejected/)
    );
  });

  it("should listen to process unhandledRejection with non-Error reasons", () => {
    const lifecycle = ProcessLifecycle.getInstance();
    lifecycle.initialize();

    const handledPromise = Promise.resolve();
    process.emit("unhandledRejection", "Rejection occurred", handledPromise);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unhandled Rejection: Rejection occurred")
    );
  });

  it("should handle uncaughtException when error.stack is undefined", () => {
    const lifecycle = ProcessLifecycle.getInstance();
    lifecycle.initialize();

    const err = new Error("No stack error");
    Object.defineProperty(err, "stack", { value: undefined });

    process.emit("uncaughtException", err);
    expect(loggerErrorSpy).toHaveBeenCalledWith("Uncaught Exception: No stack error");
  });

  it("should handle unhandledRejection when reason is an Error without a stack", () => {
    const lifecycle = ProcessLifecycle.getInstance();
    lifecycle.initialize();

    const err = new Error("No stack rejection");
    Object.defineProperty(err, "stack", { value: undefined });

    process.emit("unhandledRejection", err, Promise.resolve());
    expect(loggerErrorSpy).toHaveBeenCalledWith("Unhandled Rejection: No stack rejection");
  });
});