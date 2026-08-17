import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shutdownConnections } from "../../../../package/core/websocket/services/gracefulShutdown.service.js";
import { ConnectionRegistry } from "../../../../package/core/websocket/services/connectionRegistry.service.js";
import type { IWebSocketConnection } from "../../../../package/types/websocket/IWebSocket.js";

describe("shutdownConnections Service", () => {
    let registry: ConnectionRegistry;

    beforeEach(() => {
        vi.useFakeTimers();
        registry = new ConnectionRegistry();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should immediately resolve if registry is empty", async () => {
        const shutdownPromise = shutdownConnections(registry, 5000);
        await expect(shutdownPromise).resolves.toBeUndefined();
    });

    it("should request clean closure and resolve when all connections deregister before timeout", async () => {
        const close1 = vi.fn();
        const close2 = vi.fn();
        const terminate1 = vi.fn();
        const terminate2 = vi.fn();

        const conn1 = { id: "1", close: close1, terminate: terminate1 } as unknown as IWebSocketConnection;
        const conn2 = { id: "2", close: close2, terminate: terminate2 } as unknown as IWebSocketConnection;

        registry.add(conn1);
        registry.add(conn2);

        const shutdownPromise = shutdownConnections(registry, 5000);

        expect(close1).toHaveBeenCalledWith(1001, "Server shutting down");
        expect(close2).toHaveBeenCalledWith(1001, "Server shutting down");

        // Simulate client acknowledgement
        registry.remove(conn1);
        registry.remove(conn2);

        vi.advanceTimersByTime(150);
        await expect(shutdownPromise).resolves.toBeUndefined();
        expect(terminate1).not.toHaveBeenCalled();
        expect(terminate2).not.toHaveBeenCalled();
    });

    it("should forcibly terminate stubborn connections when timeout expires", async () => {
        const close1 = vi.fn();
        const terminate1 = vi.fn();
        const conn1 = { id: "stubborn", close: close1, terminate: terminate1 } as unknown as IWebSocketConnection;

        registry.add(conn1);

        const shutdownPromise = shutdownConnections(registry, 3000);

        expect(close1).toHaveBeenCalledWith(1001, "Server shutting down");
        expect(terminate1).not.toHaveBeenCalled();

        // Advance to full timeout
        vi.advanceTimersByTime(3000);

        await expect(shutdownPromise).resolves.toBeUndefined();
        expect(terminate1).toHaveBeenCalledOnce();
    });
});