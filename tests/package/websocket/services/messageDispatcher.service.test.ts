import { describe, expect, it, vi } from "vitest";
import { dispatchMessage } from "../../../../package/core/websocket/services/messageDispatcher.service.js";
import type { WebSocketConnection } from "../../../../package/core/websocket/WebSocketConnection.js";
import type { IWebSocketHandlers } from "../../../../package/types/websocket/IWebSocket.js";

describe("dispatchMessage Service", () => {
    it("should close connection with 1008 if rate limit is exceeded", () => {
        const closeMock = vi.fn();
        const mockConn = {
            id: "test-conn",
            _rateLimiter: { tryConsume: vi.fn().mockReturnValue(false) },
            close: closeMock,
        } as unknown as WebSocketConnection;

        const handlers: IWebSocketHandlers = {
            onMessage: vi.fn(),
        };

        dispatchMessage(mockConn, handlers, "test data", false);

        expect(closeMock).toHaveBeenCalledWith(1008, "Rate limit exceeded");
        expect(handlers.onMessage).not.toHaveBeenCalled();
    });

    it("should gracefully do nothing if onMessage handler is undefined", () => {
        const mockConn = {
            id: "test-conn",
            _rateLimiter: { tryConsume: vi.fn().mockReturnValue(true) },
            close: vi.fn(),
        } as unknown as WebSocketConnection;

        expect(() => dispatchMessage(mockConn, {}, "payload", false)).not.toThrow();
    });

    it("should invoke onMessage with proper arguments on valid consumption", () => {
        const onMessageMock = vi.fn();
        const mockConn = {
            id: "test-conn",
            _rateLimiter: { tryConsume: vi.fn().mockReturnValue(true) },
        } as unknown as WebSocketConnection;

        const handlers: IWebSocketHandlers = { onMessage: onMessageMock };

        dispatchMessage(mockConn, handlers, "valid payload", false);
        expect(onMessageMock).toHaveBeenCalledWith(mockConn, "valid payload", false);
    });

    it("should catch synchronous errors thrown in onMessage without unhandled exceptions", () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const mockConn = {
            id: "conn-err",
            _rateLimiter: { tryConsume: vi.fn().mockReturnValue(true) },
        } as unknown as WebSocketConnection;

        const handlers: IWebSocketHandlers = {
            onMessage: vi.fn().mockImplementation(() => {
                throw new Error("Custom processing failure");
            }),
        };

        expect(() => dispatchMessage(mockConn, handlers, "data", false)).not.toThrow();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining("[Subatom WS] onMessage handler threw for conn-err:"),
            "Custom processing failure",
        );
        consoleErrorSpy.mockRestore();
    });

    it("should handle rejected promises returned from onMessage", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const mockConn = {
            id: "conn-async-err",
            _rateLimiter: { tryConsume: vi.fn().mockReturnValue(true) },
        } as unknown as WebSocketConnection;

        const handlers: IWebSocketHandlers = {
            onMessage: vi.fn().mockRejectedValue(new Error("Async failure")),
        };

        dispatchMessage(mockConn, handlers, "data", false);

        await Promise.resolve(); // Allow promise rejection handler tick

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining("[Subatom WS] onMessage handler rejected for conn-async-err:"),
            "Async failure",
        );
        consoleErrorSpy.mockRestore();
    });
});