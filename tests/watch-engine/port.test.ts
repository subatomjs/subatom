import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../package/watch-engine/utils/logger.js";
import { resolvePort } from "../../package/watch-engine/utils/port.js";

const { mockCreateServer } = vi.hoisted(() => ({
	mockCreateServer: vi.fn(),
}));

vi.mock("node:net", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:net")>();
	return {
		...actual,
		createServer: mockCreateServer,
	};
});

describe("resolvePort", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns preferred port when it is available immediately", async () => {
		mockCreateServer.mockImplementation(() => {
			const emitter = new EventEmitter() as any;
			emitter.listen = vi.fn(() => emitter.emit("listening"));
			emitter.close = vi.fn((cb: () => void) => cb && cb());
			return emitter;
		});

		const port = await resolvePort(3000, "127.0.0.1");
		expect(port).toBe(3000);
	});

	it("increments to find the next available port when preferred is occupied", async () => {
		let attempts = 0;
		const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

		mockCreateServer.mockImplementation(() => {
			const emitter = new EventEmitter() as any;
			emitter.listen = vi.fn(() => {
				attempts++;
				if (attempts === 1) {
					emitter.emit("error", new Error("EADDRINUSE"));
				} else {
					emitter.emit("listening");
				}
			});
			emitter.close = vi.fn((cb: () => void) => cb && cb());
			return emitter;
		});

		const port = await resolvePort(3000, "127.0.0.1");
		expect(port).toBe(3001);
		expect(warnSpy).toHaveBeenCalledWith(
			"Port 3000 is in use, using 3001 instead.",
		);
	});

	it("throws error when all attempt offsets are occupied", async () => {
		mockCreateServer.mockImplementation(() => {
			const emitter = new EventEmitter() as any;
			emitter.listen = vi.fn(() => {
				emitter.emit("error", new Error("EADDRINUSE"));
			});
			emitter.close = vi.fn((cb: () => void) => cb && cb());
			return emitter;
		});

		await expect(resolvePort(3000, "127.0.0.1", 3)).rejects.toThrow(
			/Could not find a free port after checking 3000-3002/,
		);
	});
});
