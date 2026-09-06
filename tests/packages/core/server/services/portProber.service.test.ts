import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { listenOnPort } from "../../../../../packages/core/server/services/portProber.service.js";

interface MockServerEmitter extends EventEmitter {
	listen: (port: number, host: string) => this;
}

function createMockServer(): { server: Server; emitter: MockServerEmitter } {
	const emitter = new EventEmitter() as MockServerEmitter;
	emitter.listen = vi.fn().mockReturnValue(emitter);
	return {
		server: emitter as unknown as Server,
		emitter,
	};
}

describe("portProber.service", () => {
	it("should resolve with server when listening event emits", async () => {
		const { server, emitter } = createMockServer();

		const listenPromise = listenOnPort(server, 3000, "127.0.0.1");
		emitter.emit("listening");

		const result = await listenPromise;
		expect(result).toBe(server);
		expect(emitter.listen).toHaveBeenCalledWith(3000, "127.0.0.1");
	});

	it("should reject with formatted message if error code is EADDRINUSE", async () => {
		const { server, emitter } = createMockServer();

		const listenPromise = listenOnPort(server, 8080, "localhost");
		const inUseError = new Error("address in use") as NodeJS.ErrnoException;
		inUseError.code = "EADDRINUSE";

		emitter.emit("error", inUseError);

		await expect(listenPromise).rejects.toThrow("Port 8080 is already in use.");
	});

	it("should reject with raw error if error code is not EADDRINUSE", async () => {
		const { server, emitter } = createMockServer();

		const listenPromise = listenOnPort(server, 80, "0.0.0.0");
		const genericError = new Error(
			"EACCES permission denied",
		) as NodeJS.ErrnoException;
		genericError.code = "EACCES";

		emitter.emit("error", genericError);

		await expect(listenPromise).rejects.toThrow("EACCES permission denied");
	});
});
