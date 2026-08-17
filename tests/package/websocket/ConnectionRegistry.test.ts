import { beforeEach, describe, expect, it } from "vitest";
import type { IWebSocketConnection } from "../../../package/types/websocket/IWebSocket.js";
import { ConnectionRegistry } from "../../../package/core/websocket/services/connectionRegistry.service.js";

function createMockConnection(id: string): IWebSocketConnection {
    return {
        id,
        raw: {} as any,
        request: {} as any,
        rooms: new Set<string>(),
        readyState: 1,
        locals: {},
        send: () => true,
        join: () => {},
        leave: () => {},
        broadcast: () => {},
        close: () => {},
        terminate: () => {},
    };
}

describe("ConnectionRegistry Service", () => {
    let registry: ConnectionRegistry;

    beforeEach(() => {
        registry = new ConnectionRegistry();
    });

    it("should add, track size, iterate all, and remove connections", () => {
        const conn1 = createMockConnection("c-1");
        const conn2 = createMockConnection("c-2");

        expect(registry.size()).toBe(0);
        registry.add(conn1);
        registry.add(conn2);

        expect(registry.size()).toBe(2);
        expect(Array.from(registry.all())).toEqual([conn1, conn2]);

        registry.remove(conn1);
        expect(registry.size()).toBe(1);
        expect(Array.from(registry.all())).toEqual([conn2]);
    });

    it("should handle joining, querying, and leaving rooms", () => {
        const conn1 = createMockConnection("c-1");
        const conn2 = createMockConnection("c-2");

        registry.joinRoom("chat", conn1);
        registry.joinRoom("chat", conn2);
        registry.joinRoom("admin", conn1);

        expect(Array.from(registry.getRoom("chat"))).toEqual([conn1, conn2]);
        expect(Array.from(registry.getRoom("admin"))).toEqual([conn1]);
        expect(Array.from(registry.getRoom("non-existent"))).toEqual([]);

        registry.leaveRoom("chat", conn1);
        expect(Array.from(registry.getRoom("chat"))).toEqual([conn2]);

        // Leaving last member should prune room set
        registry.leaveRoom("chat", conn2);
        expect(registry.getRoom("chat").size).toBe(0);
    });

    it("should safely handle leaveRoom for non-existent rooms", () => {
        const conn1 = createMockConnection("c-1");
        expect(() => registry.leaveRoom("ghost-room", conn1)).not.toThrow();
    });

    it("should automatically prune connection from all rooms on remove()", () => {
        const conn1 = createMockConnection("c-1");
        const conn2 = createMockConnection("c-2");

        registry.add(conn1);
        registry.add(conn2);
        registry.joinRoom("room-A", conn1);
        registry.joinRoom("room-A", conn2);
        registry.joinRoom("room-B", conn1);

        registry.remove(conn1);

        expect(registry.size()).toBe(1);
        expect(Array.from(registry.getRoom("room-A"))).toEqual([conn2]);
        expect(registry.getRoom("room-B").size).toBe(0);
    });
});