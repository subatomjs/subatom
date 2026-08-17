import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { reqOnEnd } from "../../../package/core/http/streams/methods/request/reqOnEnd.js";

describe("reqOnEnd", () => {
	it("should attach 'end' listener and trigger once", () => {
		const req = new EventEmitter() as unknown as IncomingMessage;
		const listener = vi.fn();

		reqOnEnd(req, listener);
		req.emit("end");
		req.emit("end");

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("should allow unregistering listener before it fires", () => {
		const req = new EventEmitter() as unknown as IncomingMessage;
		const listener = vi.fn();

		const unsubscribe = reqOnEnd(req, listener);
		unsubscribe();

		req.emit("end");
		expect(listener).not.toHaveBeenCalled();
	});
});
