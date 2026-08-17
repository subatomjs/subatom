import type { IncomingMessage } from "node:http";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { reqPipe } from "../../../package/core/http/streams/methods/request/reqPipe.js";

describe("reqPipe", () => {
	it("should pipe request to destination stream with options", () => {
		const req = new PassThrough() as unknown as IncomingMessage;
		const dest = new PassThrough();
		const pipeSpy = vi.spyOn(req, "pipe");

		const result = reqPipe(req, dest, { end: false });

		expect(pipeSpy).toHaveBeenCalledWith(dest, { end: false });
		expect(result).toBe(dest);
	});

	it("should throw error if request stream is destroyed", () => {
		const req = new PassThrough() as unknown as IncomingMessage;
		req.destroyed = true;
		const dest = new PassThrough();

		expect(() => reqPipe(req, dest)).toThrow(
			"[Subatom Stream Error]: Cannot pipe a destroyed request stream.",
		);
	});
});
