import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { reqOnData } from "../../../package/core/http/streams/methods/request/reqOnData.js";

describe("reqOnData", () => {
    it("should attach listener and pass Buffer chunk directly", () => {
        const req = new EventEmitter() as unknown as IncomingMessage;
        const listener = vi.fn();

        const unsubscribe = reqOnData(req, listener);
        const chunk = Buffer.from("test stream chunk");

        req.emit("data", chunk);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(chunk);

        unsubscribe();
    });

    it("should convert string chunk to Buffer before invoking listener", () => {
        const req = new EventEmitter() as unknown as IncomingMessage;
        const listener = vi.fn();

        reqOnData(req, listener);
        req.emit("data", "string payload");

        expect(listener).toHaveBeenCalledTimes(1);
        const received = listener.mock.calls[0][0];
        expect(Buffer.isBuffer(received)).toBe(true);
        expect(received.toString()).toBe("string payload");
    });

    it("should convert Uint8Array chunk to Buffer", () => {
        const req = new EventEmitter() as unknown as IncomingMessage;
        const listener = vi.fn();

        reqOnData(req, listener);
        const uint8 = new Uint8Array([104, 101, 108, 108, 111]);
        req.emit("data", uint8);

        expect(listener).toHaveBeenCalledTimes(1);
        const received = listener.mock.calls[0][0];
        expect(Buffer.isBuffer(received)).toBe(true);
        expect(received.toString()).toBe("hello");
    });

    it("should remove listener when calling returned cleanup function", () => {
        const req = new EventEmitter() as unknown as IncomingMessage;
        const listener = vi.fn();

        const unsubscribe = reqOnData(req, listener);
        unsubscribe();

        req.emit("data", Buffer.from("ignored chunk"));
        expect(listener).not.toHaveBeenCalled();
    });
});