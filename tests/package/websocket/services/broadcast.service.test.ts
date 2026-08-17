import { describe, expect, it, vi } from "vitest";
import { broadcastAll } from "../../../../package/core/websocket/services/broadcast.service.js";
import { ConnectionRegistry } from "../../../../package/core/websocket/services/connectionRegistry.service.js";
import type { IWebSocketConnection } from "../../../../package/types/websocket/IWebSocket.js";

describe("broadcastAll Service", () => {
	it("should send message to all registered connections", () => {
		const registry = new ConnectionRegistry();
		const send1 = vi.fn();
		const send2 = vi.fn();

		const conn1 = { id: "1", send: send1 } as unknown as IWebSocketConnection;
		const conn2 = { id: "2", send: send2 } as unknown as IWebSocketConnection;

		registry.add(conn1);
		registry.add(conn2);

		broadcastAll(registry, "announcement");

		expect(send1).toHaveBeenCalledWith("announcement");
		expect(send2).toHaveBeenCalledWith("announcement");
	});

	it("should exclude the connection with excludeId", () => {
		const registry = new ConnectionRegistry();
		const send1 = vi.fn();
		const send2 = vi.fn();

		const conn1 = {
			id: "sender-1",
			send: send1,
		} as unknown as IWebSocketConnection;
		const conn2 = {
			id: "receiver-2",
			send: send2,
		} as unknown as IWebSocketConnection;

		registry.add(conn1);
		registry.add(conn2);

		broadcastAll(registry, { alert: "new post" }, "sender-1");

		expect(send1).not.toHaveBeenCalled();
		expect(send2).toHaveBeenCalledWith({ alert: "new post" });
	});
});
