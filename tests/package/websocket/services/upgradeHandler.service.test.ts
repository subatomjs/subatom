import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import { handleUpgrade } from "../../../../package/core/websocket/services/upgradeHandler.service.js";
import type { IWebSocketRoute } from "../../../../package/types/websocket/IWebSocket.js";

describe("handleUpgrade Service", () => {
	function createMocks() {
		const mockSocket = {
			writable: true,
			destroy: vi.fn(),
			end: vi.fn(),
		} as unknown as Socket;

		const mockWss = {
			handleUpgrade: vi.fn((_req, _sock, _head, cb) => cb("rawSocketInstance")),
		} as unknown as WebSocketServer;

		const routes = new Map<string, IWebSocketRoute>();
		return { mockSocket, mockWss, routes };
	}

	it("should destroy socket if URL is unparseable", async () => {
		const { mockSocket, mockWss, routes } = createMocks();
		const req = { url: "http://[invalid-url", headers: {} } as IncomingMessage;

		await handleUpgrade(
			req,
			mockSocket,
			Buffer.alloc(0),
			mockWss,
			routes,
			{},
			vi.fn(),
		);

		expect(mockSocket.destroy).toHaveBeenCalled();
	});

	it("should respond with 404 and end socket if route is not registered", async () => {
		const { mockSocket, mockWss, routes } = createMocks();
		const req = {
			url: "/unregistered",
			headers: { host: "localhost" },
		} as IncomingMessage;

		await handleUpgrade(
			req,
			mockSocket,
			Buffer.alloc(0),
			mockWss,
			routes,
			{},
			vi.fn(),
		);

		expect(mockSocket.end).toHaveBeenCalledWith(
			"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n",
		);
		expect(mockWss.handleUpgrade).not.toHaveBeenCalled();
	});

	it("should respond with 401 and end socket if verifyClient returns false", async () => {
		const { mockSocket, mockWss, routes } = createMocks();
		routes.set("/ws", {
			path: "/ws",
			handlers: {
				options: {
					verifyClient: vi.fn().mockResolvedValue(false),
				},
			},
		});
		const req = {
			url: "/ws",
			headers: { host: "localhost" },
		} as IncomingMessage;

		await handleUpgrade(
			req,
			mockSocket,
			Buffer.alloc(0),
			mockWss,
			routes,
			{},
			vi.fn(),
		);

		expect(mockSocket.end).toHaveBeenCalledWith(
			"HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n",
		);
		expect(mockWss.handleUpgrade).not.toHaveBeenCalled();
	});

	it("should respond with 401 if verifyClient throws an exception", async () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { mockSocket, mockWss, routes } = createMocks();
		routes.set("/secure", {
			path: "/secure",
			handlers: {},
		});
		const options = {
			verifyClient: vi
				.fn()
				.mockRejectedValue(new Error("JWT Verification failed")),
		};
		const req = {
			url: "/secure",
			headers: { host: "localhost" },
		} as IncomingMessage;

		await handleUpgrade(
			req,
			mockSocket,
			Buffer.alloc(0),
			mockWss,
			routes,
			options,
			vi.fn(),
		);

		expect(mockSocket.end).toHaveBeenCalledWith(
			"HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n",
		);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"[Subatom WS] verifyClient threw:",
			"JWT Verification failed",
		);
		consoleErrorSpy.mockRestore();
	});

	it("should skip handleUpgrade if socket is no longer writable", async () => {
		const { mockSocket, mockWss, routes } = createMocks();
		(mockSocket as any).writable = false;
		routes.set("/ws", { path: "/ws", handlers: {} });
		const req = {
			url: "/ws",
			headers: { host: "localhost" },
		} as IncomingMessage;

		await handleUpgrade(
			req,
			mockSocket,
			Buffer.alloc(0),
			mockWss,
			routes,
			{},
			vi.fn(),
		);

		expect(mockWss.handleUpgrade).not.toHaveBeenCalled();
	});

	it("should complete upgrade and invoke onConnectionEstablished on valid request", async () => {
		const { mockSocket, mockWss, routes } = createMocks();
		const route: IWebSocketRoute = {
			path: "/ws",
			handlers: { options: { verifyClient: () => true } },
		};
		routes.set("/ws", route);

		const req = {
			url: "/ws",
			headers: { host: "localhost" },
		} as IncomingMessage;
		const onEstablishedMock = vi.fn();
		const head = Buffer.from("head");

		await handleUpgrade(
			req,
			mockSocket,
			head,
			mockWss,
			routes,
			{},
			onEstablishedMock,
		);

		expect(mockWss.handleUpgrade).toHaveBeenCalledWith(
			req,
			mockSocket,
			head,
			expect.any(Function),
		);
		expect(onEstablishedMock).toHaveBeenCalledWith(
			"rawSocketInstance",
			req,
			route,
		);
	});
});
