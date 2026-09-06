import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import { closeServer } from "../../../../../packages/core/server/services/serverShutdown.service.js";

describe("serverShutdown.service", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("should close server, clear force-timer, and invoke callback on success", () => {
		const openSockets = new Set<Socket>();
		const callback = vi.fn();
		const serverCloseMock = vi.fn(
			(cb?: (err?: Error) => void): Server => {
				cb?.();
				return {} as Server;
			},
		);
		const mockServer = {
			close: serverCloseMock,
		} as unknown as Server;

		closeServer(mockServer, openSockets, 5000, callback);

		expect(serverCloseMock).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledWith(undefined);
	});

	it("should destroy remaining sockets when timeout expires before server completes close", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const destroy1 = vi.fn();
		const destroy2 = vi.fn();
		const socket1 = { destroy: destroy1 } as unknown as Socket;
		const socket2 = { destroy: destroy2 } as unknown as Socket;
		const openSockets = new Set<Socket>([socket1, socket2]);

		let capturedCloseCb: ((err?: Error) => void) | undefined;
		const mockServer = {
			close: vi.fn((cb?: (err?: Error) => void) => {
				capturedCloseCb = cb;
				return {} as Server;
			}),
		} as unknown as Server;

		closeServer(mockServer, openSockets, 3000);

		expect(openSockets.size).toBe(2);

		vi.advanceTimersByTime(3000);

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("2 connection(s) still open after 3000ms; force-closing."),
		);
		expect(destroy1).toHaveBeenCalledTimes(1);
		expect(destroy2).toHaveBeenCalledTimes(1);
		expect(openSockets.size).toBe(0);

		capturedCloseCb?.();
	});

	it("should use default timeout of 1000ms if not explicitly provided", () => {
		const openSockets = new Set<Socket>();
		const mockServer = {
			close: vi.fn(),
		} as unknown as Server;

		closeServer(mockServer, openSockets);

		vi.advanceTimersByTime(999);
		expect(openSockets.size).toBe(0);
		vi.advanceTimersByTime(1);
	});
});