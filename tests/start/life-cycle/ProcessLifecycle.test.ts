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

  it("should behave as a singleton", () => {
    const a = ProcessLifecycle.getInstance();
    const b = ProcessLifecycle.getInstance();
    expect(a).toBe(b);
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

  it("should safely continue when a shutdown hook throws", async () => {
    const lifecycle = ProcessLifecycle.getInstance();
    const failingHook = vi.fn().mockRejectedValue(new Error("Hook failed"));
    const succeedingHook = vi.fn();

    lifecycle.onShutdown(failingHook);
    lifecycle.onShutdown(succeedingHook);

    await lifecycle.handleShutdown();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error during lifecycle shutdown hook: Hook failed")
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

  it("should listen to process unhandledRejection", () => {
    const lifecycle = ProcessLifecycle.getInstance();
    lifecycle.initialize();

    const handledPromise = Promise.reject("Reason").catch(() => {});
    process.emit("unhandledRejection", "Rejection occurred", handledPromise);
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unhandled Rejection: Rejection occurred")
    );
  });
});