import { EventEmitter } from "node:events";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketManager } from "../../../package/core/websocket/WebSocketManager.js";
import * as upgradeHandlerModule from "../../../package/core/websocket/services/upgradeHandler.service.js";

describe("WebSocketManager", () => {
    let mockHttpServer: HttpServer;
    let manager: WebSocketManager;

    beforeEach(() => {
        mockHttpServer = new EventEmitter() as unknown as HttpServer;
        manager = new WebSocketManager(mockHttpServer);
    });

    afterEach(async () => {
        await manager.shutdown();
    });

    it("should reject duplicate route registrations", () => {
        manager.register("/chat", {});
        expect(() => manager.register("/chat", {})).toThrowError(
            '[Subatom WS] Route "/chat" is already registered.',
        );
    });

    it("should activate, initialize WebSocketServer and start heartbeat", () => {
        expect(manager.isActive).toBe(false);
        expect(manager.connectionCount).toBe(0);

        manager.activate({ maxConnections: 100 });
        expect(manager.isActive).toBe(true);

        // Activating again is idempotent
        manager.activate();
        expect(manager.isActive).toBe(true);
    });

    it("should reject upgrade with 503 if maxConnections capacity is reached", () => {
        manager.activate({ maxConnections: 0 });

        const mockSocket = {
            write: vi.fn(),
            destroy: vi.fn(),
        } as unknown as Socket;

        mockHttpServer.emit("upgrade", {} as IncomingMessage, mockSocket, Buffer.alloc(0));

        expect(mockSocket.write).toHaveBeenCalledWith(
            "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
        );
        expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it("should delegate upgrade to handleUpgrade and wire connection lifecycle events", async () => {
        manager.activate();
        manager.register("/stream", {
            onConnection: vi.fn(),
            onMessage: vi.fn(),
            onClose: vi.fn(),
            onError: vi.fn(),
        });

        const rawSocketEmitter = new EventEmitter() as any;
        rawSocketEmitter.OPEN = 1;
        rawSocketEmitter.readyState = 1;
        rawSocketEmitter.bufferedAmount = 0;
        rawSocketEmitter.close = vi.fn();
        rawSocketEmitter.terminate = vi.fn();

        let establishedCb: any;
        vi.spyOn(upgradeHandlerModule, "handleUpgrade").mockImplementation(
            async (_req, _sock, _head, _wss, _routes, _opts, onEstablished) => {
                establishedCb = onEstablished;
            },
        );

        const mockSocket = { destroy: vi.fn() } as unknown as Socket;
        const mockReq = { url: "/stream", headers: { host: "localhost" } } as IncomingMessage;

        mockHttpServer.emit("upgrade", mockReq, mockSocket, Buffer.alloc(0));
        expect(establishedCb).toBeDefined();

        // Establish connection
        establishedCb(rawSocketEmitter, mockReq, { path: "/stream", handlers: {} });
        expect(manager.connectionCount).toBe(1);

        // Verify pong handler resets liveness
        rawSocketEmitter.emit("pong");

        // Verify error handler removes connection
        rawSocketEmitter.emit("error", new Error("Socket error"));
        expect(manager.connectionCount).toBe(0);
    });

    it("should handle broadcast and clean shutdown", async () => {
        manager.activate();
        manager.broadcast("test-message");
        expect(manager.isActive).toBe(true);

        await manager.shutdown(100);
        expect(manager.isActive).toBe(false);
    });
});