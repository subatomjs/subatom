import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import {
  createServer,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { Socket } from "node:net";

// 1. Mock Node built-ins
vi.mock("node:http", async () => {
  const actual = await vi.importActual<typeof import("node:http")>("node:http");
  return {
    ...actual,
    createServer: vi.fn(),
  };
});

// 2. Mock Internal Modules using standard 3-level relative path from tests/package/subatom-server/
vi.mock("../../../package/config/ConfigManager.js", () => ({
  ConfigManager: { resolve: vi.fn() },
}));

vi.mock(
  "../../../package/core/bootstrap/subatom-server/services/portProber.service.js",
  () => ({
    getAvailablePort: vi.fn(),
  }),
);

vi.mock(
  "../../../package/core/bootstrap/subatom-server/services/requestHandler.service.js",
  () => ({
    processHttpRequest: vi.fn(),
  }),
);

vi.mock(
  "../../../package/core/bootstrap/subatom-server/services/serverShutdown.service.js",
  () => ({
    closeServer: vi.fn(),
  }),
);

vi.mock(
  "../../../package/core/bootstrap/subatom-server/services/socketTracker.service.js",
  () => ({
    trackSocket: vi.fn(),
  }),
);

vi.mock(
  "../../../package/core/bootstrap/subatom-server/services/orphanRecovery.service.js",
  () => ({
    tryRecoverFromOrphanedRejection: vi.fn(),
  }),
);

vi.mock("../../../package/core/websocket/WebSocketManager.js", () => {
  const WebSocketManager = vi.fn(function (this: any) {
    this.register = vi.fn();
    this.activate = vi.fn();
    this.shutdown = vi.fn();
  });
  return { WebSocketManager };
});

// 3. Import mocked entities and the actual Class
import { SubatomServer } from "../../../package/core/bootstrap/subatom-server/SubatomServer.js";
import { ConfigManager } from "../../../package/config/ConfigManager.js";
import { getAvailablePort } from "../../../package/core/bootstrap/subatom-server/services/portProber.service.js";
import { processHttpRequest } from "../../../package/core/bootstrap/subatom-server/services/requestHandler.service.js";
import { closeServer } from "../../../package/core/bootstrap/subatom-server/services/serverShutdown.service.js";
import { trackSocket } from "../../../package/core/bootstrap/subatom-server/services/socketTracker.service.js";
import { tryRecoverFromOrphanedRejection } from "../../../package/core/bootstrap/subatom-server/services/orphanRecovery.service.js";
import { WebSocketManager } from "../../../package/core/websocket/WebSocketManager.js";
import type { Router } from "../../../package/core/router/Router.js";

describe("SubatomServer", () => {
  let mockRouter: Router;
  let mockServerInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServerInstance = {
      on: vi.fn(),
      listen: vi.fn((_port, _host, cb) => {
        if (cb) cb();
        return mockServerInstance;
      }),
      address: vi.fn(() => ({ port: 8080, address: "127.0.0.1" })),
    };
    (createServer as Mock).mockReturnValue(mockServerInstance);

    mockRouter = {} as Router;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization & Constructor", () => {
    it("should initialize HTTP server and WebSocketManager", () => {
      const wsRoutes = [{ path: "/ws", handlers: [] }];
      new SubatomServer(mockRouter, [], [], wsRoutes as any);

      expect(createServer).toHaveBeenCalledOnce();
      expect(WebSocketManager).toHaveBeenCalledWith(mockServerInstance);

      const wsManagerInstance = vi.mocked(WebSocketManager).mock.instances[0] as any;
      expect(wsManagerInstance.register).toHaveBeenCalledWith("/ws", []);
    });

    it("should bind connection and clientError events to the HTTP server", () => {
      new SubatomServer(mockRouter);

      expect(mockServerInstance.on).toHaveBeenCalledWith(
        "connection",
        expect.any(Function),
      );
      expect(mockServerInstance.on).toHaveBeenCalledWith(
        "clientError",
        expect.any(Function),
      );
    });
  });

  describe("Event Handling", () => {
    let connectionHandler: Function;
    let clientErrorHandler: Function;

    beforeEach(() => {
      new SubatomServer(mockRouter);

      const calls = mockServerInstance.on.mock.calls;
      connectionHandler = calls.find((c: any) => c[0] === "connection")[1];
      clientErrorHandler = calls.find((c: any) => c[0] === "clientError")[1];
    });

    it("should track sockets on new connections", () => {
      const mockSocket = new Socket();
      connectionHandler(mockSocket);

      expect(trackSocket).toHaveBeenCalledWith(expect.any(Set), mockSocket);
    });

    it("should handle clientError gracefully when socket is writable", () => {
      const mockSocket = {
        writable: true,
        end: vi.fn(),
        destroy: vi.fn(),
      } as unknown as Socket;
      const error = new Error("Parse Error");
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      clientErrorHandler(error, mockSocket);

      expect(mockSocket.end).toHaveBeenCalledWith(
        "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Client connection error:"),
        "Parse Error",
      );
    });

    it("should destroy socket on clientError when socket is not writable", () => {
      const mockSocket = {
        writable: false,
        end: vi.fn(),
        destroy: vi.fn(),
      } as unknown as Socket;
      const error = new Error("Network Drop");

      clientErrorHandler(error, mockSocket);

      expect(mockSocket.destroy).toHaveBeenCalledOnce();
      expect(mockSocket.end).not.toHaveBeenCalled();
    });
  });

  describe("Configuration API", () => {
    it("should allow setting configuration state dynamically via setConfig", async () => {
      const server = new SubatomServer(mockRouter);

      (ConfigManager.resolve as Mock).mockResolvedValue({
        port: 3000,
        host: "localhost",
      });
      (getAvailablePort as Mock).mockResolvedValue(3000);

      server.setConfig({ appName: "CustomApp", port: "8080" as any });
      await server.start();

      expect(ConfigManager.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: "CustomApp",
          port: 8080,
        }),
      );
    });

    it("should set pipeline config correctly", () => {
      const server = new SubatomServer(mockRouter);
      const pipelineConfig = {
        transformers: [],
        interceptors: [],
        serializers: [],
      };

      server.setPipelineConfig(pipelineConfig);
      expect(server).toBeDefined();
    });
  });

  describe("Startup Workflow (start & listen)", () => {
    let server: SubatomServer;

    beforeEach(() => {
      server = new SubatomServer(mockRouter);
      (getAvailablePort as Mock).mockResolvedValue(8080);
    });

    it("should probe for available ports and start listening", async () => {
      (ConfigManager.resolve as Mock).mockResolvedValue({
        port: 8080,
        host: "0.0.0.0",
        appName: "TestApp",
      });

      await server.start();

      expect(getAvailablePort).toHaveBeenCalledWith(8080, "0.0.0.0");
      expect(mockServerInstance.listen).toHaveBeenCalledWith(
        8080,
        "0.0.0.0",
        expect.any(Function),
      );
    });

    it("should log a warning if requested port is in use and switched", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      (ConfigManager.resolve as Mock).mockResolvedValue({
        port: 8080,
        host: "localhost",
      });
      (getAvailablePort as Mock).mockResolvedValue(8081);

      await server.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Port 8080 is in use. Automatically switched to 8081.",
        ),
      );
    });

    it("should activate WebSocket if config has websocket enabled", async () => {
      (ConfigManager.resolve as Mock).mockResolvedValue({
        port: 8080,
        websocket: true,
        websocketOptions: { maxPayload: 1024 },
      });

      await server.start();

      const wsManagerInstance = vi.mocked(WebSocketManager).mock.instances[0] as any;
      expect(wsManagerInstance.activate).toHaveBeenCalledWith({
        maxPayload: 1024,
      });
    });

    it("should wrap start gracefully using listen() and fire callback", async () => {
      (ConfigManager.resolve as Mock).mockResolvedValue({ port: 3000 });
      (getAvailablePort as Mock).mockResolvedValue(3000);

      const callback = vi.fn();
      await server.listen(3000, "localhost", "App", callback);

      expect(callback).toHaveBeenCalledWith(8080);
    });
  });

  describe("HTTP Request Handling", () => {
    it("should delegate native HTTP requests to processHttpRequest", async () => {
      let requestHandler: Function;
      (createServer as Mock).mockImplementation((handler) => {
        requestHandler = handler;
        return mockServerInstance;
      });

      new SubatomServer(mockRouter);

      const req = {
        on: vi.fn(),
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
      } as unknown as IncomingMessage;
      const res = {
        on: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      await requestHandler!(req, res);

      expect(processHttpRequest).toHaveBeenCalledWith(
        req,
        res,
        mockRouter,
        [],
        [],
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe("Graceful Shutdown", () => {
    it("should invoke serverShutdown service and teardown websockets", async () => {
      const server = new SubatomServer(mockRouter);
      const callback = vi.fn();

      (ConfigManager.resolve as Mock).mockResolvedValue({
        websocketOptions: { shutdownTimeoutMs: 5000 },
      });
      await server.start();

      server.close(callback);

      const wsManagerInstance = vi.mocked(WebSocketManager).mock.instances[0] as any;
      expect(wsManagerInstance.shutdown).toHaveBeenCalledWith(5000);

      expect(closeServer).toHaveBeenCalledWith(
        mockServerInstance,
        expect.any(Set),
        5000,
        callback,
      );
    });
  });

  describe("Error Recovery", () => {
    it("should pass orphaned rejections to the recovery service", () => {
      const server = new SubatomServer(mockRouter);
      const reason = new Error("Unhandled Promise");

      (tryRecoverFromOrphanedRejection as Mock).mockReturnValue(true);

      const result = server.tryRecoverFromOrphanedRejection(reason);

      expect(tryRecoverFromOrphanedRejection).toHaveBeenCalledWith(
        expect.any(Object),
        [],
        reason,
      );
      expect(result).toBe(true);
    });
  });
});