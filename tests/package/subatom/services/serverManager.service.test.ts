import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ensureServerInstance,
  performGracefulShutdown,
} from "../../../../package/core/bootstrap/subatom/services/serverManager.service.js";
import { Router } from "../../../../package/core/router/Router.js";
import type { SubatomServer } from "../../../../package/core/bootstrap/subatom-server/SubatomServer.js";

const { mockSetConfig, MockSubatomServer } = vi.hoisted(() => {
  const mockSetConfig = vi.fn();
  const MockSubatomServer = vi.fn().mockImplementation(function () {
    return {
      setConfig: mockSetConfig,
      close: vi.fn(),
    };
  });
  return { mockSetConfig, MockSubatomServer };
});

vi.mock("../../../../package/core/bootstrap/subatom-server/SubatomServer.js", () => ({
  SubatomServer: MockSubatomServer,
}));

describe("Unit: serverManager.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureServerInstance", () => {
    it("should instantiate a new SubatomServer and configure it when currentServer is undefined", () => {
      const router = new Router();
      const middlewares: any[] = [];
      const errorMiddlewares: any[] = [];
      const customConfig = { port: 3000 };
      const wsRoutes: any[] = [];

      const result = ensureServerInstance(
        undefined,
        router,
        middlewares,
        errorMiddlewares,
        customConfig,
        wsRoutes
      );

      expect(MockSubatomServer).toHaveBeenCalledTimes(1);
      expect(MockSubatomServer).toHaveBeenCalledWith(
        router,
        middlewares,
        errorMiddlewares,
        wsRoutes
      );
      expect(mockSetConfig).toHaveBeenCalledWith(customConfig);
      expect(result).toBeDefined();
    });

    it("should return the existing currentServer instance without creating a new one", () => {
      const existingServer = { setConfig: vi.fn() } as unknown as SubatomServer;
      MockSubatomServer.mockClear();

      const result = ensureServerInstance(
        existingServer,
        new Router(),
        [],
        [],
        {},
        []
      );

      expect(result).toBe(existingServer);
      expect(MockSubatomServer).not.toHaveBeenCalled();
    });
  });

  describe("performGracefulShutdown", () => {
    let exitSpy: any;
    let logSpy: any;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
      logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should exit immediately with specified exit code if serverInstance is undefined", () => {
      performGracefulShutdown(undefined, 0);

      expect(logSpy).toHaveBeenCalledWith("[Subatom] Shutting down active connections...");
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("should close server and exit process upon callback completion", () => {
      const mockServer = {
        close: vi.fn((cb: () => void) => cb()),
      } as unknown as SubatomServer;

      performGracefulShutdown(mockServer, 2);

      expect(logSpy).toHaveBeenCalledWith("[Subatom] Shutting down active connections...");
      expect(mockServer.close).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith("[Subatom] Server successfully closed.");
      expect(exitSpy).toHaveBeenCalledWith(2);
    });
  });
});