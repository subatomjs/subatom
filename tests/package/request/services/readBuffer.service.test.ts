// tests/services/readBuffer.service.test.ts
import { describe, expect, it } from "vitest";
import {
	BadRequestError,
	PayloadTooLargeError,
} from "../../../../package/core/http/errors/Error.js";
import { readBuffer } from "../../../../package/core/http/request/services/readBuffer.service.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("readBuffer service", () => {
	it("should read complete stream chunks into a single Buffer", async () => {
		const raw = createMockIncomingMessage({
			bodyChunks: [Buffer.from("Hello "), Buffer.from("World!")],
		});

		const result = await readBuffer(raw);
		expect(result.toString("utf-8")).toBe("Hello World!");
	});

	it("should handle empty body stream cleanly", async () => {
		const raw = createMockIncomingMessage({ bodyChunks: [] });
		const result = await readBuffer(raw);
		expect(result.length).toBe(0);
	});

	it("should throw PayloadTooLargeError when byte size limit is exceeded", async () => {
		const raw = createMockIncomingMessage({
			bodyChunks: [Buffer.from("12345"), Buffer.from("67890")],
		});

		await expect(readBuffer(raw, 8)).rejects.toThrowError(PayloadTooLargeError);
		expect(raw.listenerCount("data")).toBe(0);
		expect(raw.listenerCount("end")).toBe(0);
	});

	it("should reject with BadRequestError and cleanup listeners on stream error", async () => {
		const streamErr = new Error("Connection reset by peer");
		const raw = createMockIncomingMessage({ emitErrorOnStream: streamErr });

		await expect(readBuffer(raw)).rejects.toThrowError(BadRequestError);
		expect(raw.listenerCount("data")).toBe(0);
		expect(raw.listenerCount("error")).toBe(0);
	});
});
