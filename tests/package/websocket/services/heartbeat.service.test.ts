import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionRegistry } from "../../../../package/core/websocket/services/connectionRegistry.service.js";
import { startHeartbeat } from "../../../../package/core/websocket/services/heartbeat.service.js";
import type { WebSocketConnection } from "../../../../package/core/websocket/WebSocketConnection.js";

describe("startHeartbeat Service", () => {
	let registry: ConnectionRegistry;

	beforeEach(() => {
		vi.useFakeTimers();
		registry = new ConnectionRegistry();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should flip _isAlive to false and invoke ping on alive connection", () => {
		const pingMock = vi.fn();
		const terminateMock = vi.fn();

		const mockConn = {
			_isAlive: true,
			raw: { ping: pingMock },
			terminate: terminateMock,
		} as unknown as WebSocketConnection;

		registry.add(mockConn);

		const timer = startHeartbeat(registry, 10_000);

		vi.advanceTimersByTime(10_000);

		expect(mockConn._isAlive).toBe(false);
		expect(pingMock).toHaveBeenCalledOnce();
		expect(terminateMock).not.toHaveBeenCalled();

		clearInterval(timer);
	});

	it("should terminate and purge dead connections that failed to pong back", () => {
		const pingMock = vi.fn();
		const terminateMock = vi.fn();

		const deadConn = {
			_isAlive: false, // timed out from previous round
			raw: { ping: pingMock },
			terminate: terminateMock,
		} as unknown as WebSocketConnection;

		registry.add(deadConn);
		expect(registry.size()).toBe(1);

		const timer = startHeartbeat(registry, 10_000);
		vi.advanceTimersByTime(10_000);

		expect(terminateMock).toHaveBeenCalledOnce();
		expect(pingMock).not.toHaveBeenCalled();
		expect(registry.size()).toBe(0);

		clearInterval(timer);
	});

	it("should catch ping throw, remove connection from registry, and terminate", () => {
		const terminateMock = vi.fn();
		const brokenConn = {
			_isAlive: true,
			raw: {
				ping: vi.fn(() => {
					throw new Error("Broken pipe");
				}),
			},
			terminate: terminateMock,
		} as unknown as WebSocketConnection;

		registry.add(brokenConn);
		const timer = startHeartbeat(registry, 5_000);

		vi.advanceTimersByTime(5_000);

		expect(terminateMock).toHaveBeenCalledOnce();
		expect(registry.size()).toBe(0);

		clearInterval(timer);
	});
});
