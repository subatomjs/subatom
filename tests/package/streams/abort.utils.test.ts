/// <reference types="node" />
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { onClientDisconnect, bindAbortSignal } from "../../../package/core/http/streams/utils/abort.utils.ts";

describe("abort.utils", () => {
    function createMockResponse(writableEnded = false): ServerResponse {
        const emitter = new EventEmitter();
        Object.defineProperty(emitter, "writableEnded", {
            value: writableEnded,
            writable: true,
            configurable: true,
        });
        return emitter as unknown as ServerResponse;
    }

    describe("onClientDisconnect", () => {
        it("should trigger callback when 'close' event is emitted before response has ended", () => {
            const res = createMockResponse(false);

            const callback = vi.fn();
            const unsubscribe = onClientDisconnect(res, callback);

            res.emit("close");

            expect(callback).toHaveBeenCalledTimes(1);
            unsubscribe();
        });

        it("should not trigger callback if response is already writableEnded", () => {
            const res = createMockResponse(true);

            const callback = vi.fn();
            onClientDisconnect(res, callback);

            res.emit("close");

            expect(callback).not.toHaveBeenCalled();
        });

        it("should only trigger callback once even if multiple 'close' events fire", () => {
            const res = createMockResponse(false);

            const callback = vi.fn();
            onClientDisconnect(res, callback);

            res.emit("close");
            res.emit("close");

            expect(callback).toHaveBeenCalledTimes(1);
        });

        it("should properly unsubscribe and stop listening", () => {
            const res = createMockResponse(false);

            const callback = vi.fn();
            const unsubscribe = onClientDisconnect(res, callback);

            unsubscribe();
            res.emit("close");

            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe("bindAbortSignal", () => {
        it("should return a no-op cleanup when signal is undefined", () => {
            const callback = vi.fn();
            const unsubscribe = bindAbortSignal(undefined, callback);
            expect(typeof unsubscribe).toBe("function");
            expect(() => unsubscribe()).not.toThrow();
            expect(callback).not.toHaveBeenCalled();
        });

        it("should trigger immediately and return no-op if signal is already aborted", () => {
            const controller = new AbortController();
            controller.abort();

            const callback = vi.fn();
            const unsubscribe = bindAbortSignal(controller.signal, callback);

            expect(callback).toHaveBeenCalledTimes(1);
            expect(typeof unsubscribe).toBe("function");
            unsubscribe();
        });

        it("should trigger callback when abort event is fired on the signal", () => {
            const controller = new AbortController();
            const callback = vi.fn();
            const unsubscribe = bindAbortSignal(controller.signal, callback);

            expect(callback).not.toHaveBeenCalled();
            controller.abort();
            expect(callback).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        it("should remove listener upon calling unsubscribe", () => {
            const controller = new AbortController();
            const callback = vi.fn();
            const unsubscribe = bindAbortSignal(controller.signal, callback);

            unsubscribe();
            controller.abort();
            expect(callback).not.toHaveBeenCalled();
        });
    });
});