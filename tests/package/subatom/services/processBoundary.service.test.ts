import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerProcessBoundary } from "../../../../package/core/bootstrap/subatom/services/processBoundary.service.js";
import { env } from "../../../../package/config/env/env.js";

describe("Unit: processBoundary.service", () => {
  let errorSpy: any;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("should register boundary and return an unregister function that removes the boundary", () => {
    const getServerInstance = vi.fn();
    const shutdownAction = vi.fn();

    const unregister = registerProcessBoundary(getServerInstance, shutdownAction);
    expect(typeof unregister).toBe("function");

    unregister();
  });

  it("should return early when global process listeners are already registered", () => {
    const unreg1 = registerProcessBoundary(vi.fn(), vi.fn());
    const unreg2 = registerProcessBoundary(vi.fn(), vi.fn());

    expect(typeof unreg1).toBe("function");
    expect(typeof unreg2).toBe("function");

    unreg1();
    unreg2();
  });

  describe("unhandledRejection listener", () => {
    it("should recover when server can handle orphaned rejection", () => {
      const tryRecoverMock = vi.fn().mockReturnValue(true);
      const mockServer = {
        tryRecoverFromOrphanedRejection: tryRecoverMock,
      } as any;

      const shutdownAction = vi.fn();
      const unregister = registerProcessBoundary(() => mockServer, shutdownAction);

      const reason = new Error("Orphaned async error");
      process.emit("unhandledRejection" as any, reason, Promise.resolve());

      expect(tryRecoverMock).toHaveBeenCalledWith(reason);
      expect(shutdownAction).not.toHaveBeenCalled();

      unregister();
    });

    it("should log error stack/message when no server recovers and reason is an Error instance", () => {
      const tryRecoverMock = vi.fn().mockReturnValue(false);
      const mockServer = {
        tryRecoverFromOrphanedRejection: tryRecoverMock,
      } as any;

      const unregister = registerProcessBoundary(() => mockServer, vi.fn());

      const reason = new Error("Database network failure");
      process.emit("unhandledRejection" as any, reason, Promise.resolve());

      expect(tryRecoverMock).toHaveBeenCalledWith(reason);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Subatom Process Error] Unhandled Promise Rejection Detected:")
      );
      expect(errorSpy).toHaveBeenCalledWith(reason.stack ?? reason.message);

      unregister();
    });

    it("should log raw reason when no server recovers and reason is not an Error instance", () => {
      const unregister = registerProcessBoundary(() => undefined, vi.fn());

      const stringReason = "Direct string rejection reason";
      process.emit("unhandledRejection" as any, stringReason, Promise.resolve());

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Subatom Process Error] Unhandled Promise Rejection Detected:")
      );
      expect(errorSpy).toHaveBeenCalledWith(stringReason);

      unregister();
    });
  });

  describe("uncaughtException listener", () => {
    it("should not trigger shutdown on uncaughtException when not in production", () => {
      vi.spyOn(env, "isProd", "get").mockReturnValue(false);

      const shutdownAction = vi.fn();
      const unregister = registerProcessBoundary(() => undefined, shutdownAction);

      const err = new Error("Dev sync crash");
      process.emit("uncaughtException" as any, err);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Subatom Fatal Error] Uncaught Synchronous Exception:")
      );
      expect(shutdownAction).not.toHaveBeenCalled();

      unregister();
    });

    it("should trigger shutdown on uncaughtException when in production mode", () => {
      vi.spyOn(env, "isProd", "get").mockReturnValue(true);

      const shutdownAction = vi.fn();
      const unregister = registerProcessBoundary(() => undefined, shutdownAction);

      const err = new Error("Fatal OOM condition");
      process.emit("uncaughtException" as any, err);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Subatom Fatal Error] Uncaught Synchronous Exception:")
      );
      expect(errorSpy).toHaveBeenCalledWith("Initiating emergency graceful shutdown...");
      expect(shutdownAction).toHaveBeenCalledWith(1);

      unregister();
    });

    it("should catch and log errors during emergency shutdown in production (Error instance)", () => {
      vi.spyOn(env, "isProd", "get").mockReturnValue(true);

      const failingShutdownAction = vi.fn().mockImplementation(() => {
        throw new Error("Shutdown Hook Failed");
      });
      const unregister = registerProcessBoundary(() => undefined, failingShutdownAction);

      const err = new Error("Fatal Error");
      process.emit("uncaughtException" as any, err);

      expect(errorSpy).toHaveBeenCalledWith(
        "[Subatom] Error during emergency shutdown: Shutdown Hook Failed"
      );

      unregister();
    });

    it("should catch and log non-Error exceptions during emergency shutdown in production", () => {
      vi.spyOn(env, "isProd", "get").mockReturnValue(true);

      const failingShutdownAction = vi.fn().mockImplementation(() => {
        throw "String-based shutdown failure";
      });
      const unregister = registerProcessBoundary(() => undefined, failingShutdownAction);

      const err = new Error("Fatal Error");
      process.emit("uncaughtException" as any, err);

      expect(errorSpy).toHaveBeenCalledWith(
        "[Subatom] Error during emergency shutdown: String-based shutdown failure"
      );

      unregister();
    });
  });

  describe("Signal Handlers (SIGINT / SIGTERM)", () => {
    it("should execute shutdownAction with exitCode 0 on SIGINT and catch exceptions", () => {
      // 1. Success case with SIGINT
      const shutdownAction = vi.fn();
      const unregister = registerProcessBoundary(() => undefined, shutdownAction);

      process.emit("SIGINT" as any);

      expect(shutdownAction).toHaveBeenCalledWith(0);
      unregister();
    });

    it("should execute shutdownAction with exitCode 0 on SIGTERM and handle thrown errors", () => {
      const throwingAction = vi.fn().mockImplementation(() => {
        throw new Error("SIGTERM cleanup failed");
      });
      const nonErrorThrowingAction = vi.fn().mockImplementation(() => {
        throw "Non-error signal failure";
      });

      // Register both boundaries to test Error and non-Error logging in a single signal dispatch
      const unreg1 = registerProcessBoundary(() => undefined, throwingAction);
      const unreg2 = registerProcessBoundary(() => undefined, nonErrorThrowingAction);

      process.emit("SIGTERM" as any);

      expect(throwingAction).toHaveBeenCalledWith(0);
      expect(nonErrorThrowingAction).toHaveBeenCalledWith(0);
      expect(errorSpy).toHaveBeenCalledWith(
        "[Subatom] Error during signal shutdown: SIGTERM cleanup failed"
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "[Subatom] Error during signal shutdown: Non-error signal failure"
      );

      unreg1();
      unreg2();
    });
  });
});