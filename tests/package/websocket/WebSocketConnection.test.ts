import type { IncomingMessage } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { ConnectionRegistry } from "../../../package/core/websocket/services/connectionRegistry.service.js";
import { WebSocketConnection } from "../../../package/core/websocket/WebSocketConnection.js";

type Writable<T> = { -readonly [P in keyof T]?: T[P] };

describe("WebSocketConnection", () => {
	let mockRawSocket: Writable<WebSocket>;
	let mockRequest: Partial<IncomingMessage>;
	let registry: ConnectionRegistry;

	beforeEach(() => {
		mockRawSocket = {
			OPEN: 1,
			CLOSING: 2,
			CLOSED: 3,
			readyState: 1,
			bufferedAmount: 0,
			send: vi.fn((_payload, cb) => (cb ? cb() : undefined)),
			close: vi.fn(),
			terminate: vi.fn(),
		};
		mockRequest = { url: "/ws", headers: {} };
		registry = new ConnectionRegistry();
	});

	it("should initialize with unique UUID, rate limiter, and default state", () => {
		const conn = new WebSocketConnection(
			mockRawSocket as WebSocket,
			mockRequest as IncomingMessage,
			registry,
			20,
		);

		expect(conn.id).toBeDefined();
		expect(typeof conn.id).toBe("string");
		expect(conn.readyState).toBe(1);
		expect(conn._isAlive).toBe(true);
		expect(conn.rooms.size).toBe(0);
		expect(conn.locals).toEqual({});
	});

	describe("send() behavior & backpressure", () => {
		it("should return false if socket is not OPEN", () => {
			mockRawSocket.readyState = 3; // CLOSED
			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			const result = conn.send("hello");
			expect(result).toBe(false);
			expect(mockRawSocket.send).not.toHaveBeenCalled();
		});

		it("should return false if bufferedAmount exceeds 1,000,000 bytes (backpressure)", () => {
			mockRawSocket.bufferedAmount = 1_000_001;
			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			const result = conn.send("overflow payload");
			expect(result).toBe(false);
			expect(mockRawSocket.send).not.toHaveBeenCalled();
		});

		it("should send string as-is and return true", () => {
			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			const result = conn.send("plain text");
			expect(result).toBe(true);
			expect(mockRawSocket.send).toHaveBeenCalledWith(
				"plain text",
				expect.any(Function),
			);
		});

		it("should send Buffer as-is and return true", () => {
			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			const buf = Buffer.from("binary data");
			const result = conn.send(buf);
			expect(result).toBe(true);
			expect(mockRawSocket.send).toHaveBeenCalledWith(
				buf,
				expect.any(Function),
			);
		});

		it("should serialize objects to JSON string", () => {
			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			const result = conn.send({ event: "pong", count: 42 });
			expect(result).toBe(true);
			expect(mockRawSocket.send).toHaveBeenCalledWith(
				JSON.stringify({ event: "pong", count: 42 }),
				expect.any(Function),
			);
		});

		it("should handle error callback in raw.send without throwing", () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			mockRawSocket.send = vi.fn((_payload, cb) => {
				if (cb) cb(new Error("Network write error"));
			});

			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			expect(conn.send("test")).toBe(true);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Subatom WS] Send failed for connection"),
				"Network write error",
			);
			consoleErrorSpy.mockRestore();
		});
	});

	describe("Rooms and Broadcasting", () => {
		it("should join and leave rooms updating both local set and registry", () => {
			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			conn.join("lobby");
			expect(conn.rooms.has("lobby")).toBe(true);
			expect(registry.getRoom("lobby").has(conn)).toBe(true);

			conn.leave("lobby");
			expect(conn.rooms.has("lobby")).toBe(false);
			expect(registry.getRoom("lobby").has(conn)).toBe(false);
		});

		it("should broadcast to other room members excluding self", () => {
			const conn1 = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);
			const mockRawSocket2: Writable<WebSocket> = {
				OPEN: 1,
				readyState: 1,
				bufferedAmount: 0,
				send: vi.fn((_, cb) => cb?.()),
			};
			const conn2 = new WebSocketConnection(
				mockRawSocket2 as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			conn1.join("global");
			conn2.join("global");

			conn1.broadcast("global", { message: "hi all" });

			expect(mockRawSocket.send).not.toHaveBeenCalled();
			expect(mockRawSocket2.send).toHaveBeenCalledWith(
				JSON.stringify({ message: "hi all" }),
				expect.any(Function),
			);
		});
	});

	describe("Lifecycle teardown", () => {
		it("should call raw.close with default or custom code & reason", () => {
			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			conn.close(1000, "Normal closure");
			expect(mockRawSocket.close).toHaveBeenCalledWith(1000, "Normal closure");
		});

		it("should fallback to terminate if raw.close throws", () => {
			mockRawSocket.close = vi.fn().mockImplementation(() => {
				throw new Error("Socket already in closing state");
			});

			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			conn.close();
			expect(mockRawSocket.terminate).toHaveBeenCalled();
		});

		it("should terminate raw socket directly", () => {
			const conn = new WebSocketConnection(
				mockRawSocket as WebSocket,
				mockRequest as IncomingMessage,
				registry,
				20,
			);

			conn.terminate();
			expect(mockRawSocket.terminate).toHaveBeenCalled();
		});
	});
});
