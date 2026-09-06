/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import net from "node:net";
import { EventEmitter } from "node:events";
import { resolvePort } from "../../../start/utils/port.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("node:net");

describe("resolvePort", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should return preferred port immediately if it is free", async () => {
		vi.spyOn(net, "createServer").mockImplementation(() => {
			const emitter = new EventEmitter() as any;
			emitter.listen = vi.fn((_p, _h) => {
				emitter.emit("listening");
			});
			emitter.close = vi.fn((cb) => cb());
			return emitter;
		});

		const port = await resolvePort(3000, "127.0.0.1");
		expect(port).toBe(3000);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("should increment and warn when preferred port is occupied", async () => {
		let callCount = 0;
		vi.spyOn(net, "createServer").mockImplementation(() => {
			const emitter = new EventEmitter() as any;
			emitter.listen = vi.fn(() => {
				callCount++;
				if (callCount === 1) {
					emitter.emit("error", new Error("EADDRINUSE"));
				} else {
					emitter.emit("listening");
				}
			});
			emitter.close = vi.fn((cb) => cb());
			return emitter;
		});

		const port = await resolvePort(3000, "localhost");
		expect(port).toBe(3001);
		expect(warnSpy).toHaveBeenCalledWith(
			"Port 3000 is in use, using 3001 instead.",
		);
	});

	it("should throw an error when maxAttempts are exceeded", async () => {
		vi.spyOn(net, "createServer").mockImplementation(() => {
			const emitter = new EventEmitter() as any;
			emitter.listen = vi.fn(() => {
				emitter.emit("error", new Error("EADDRINUSE"));
			});
			return emitter;
		});

		await expect(resolvePort(8000, "localhost", 3)).rejects.toThrow(
			"Could not find a free port after checking 8000-8002.",
		);
	});
});
