import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { writeWithBackpressure } from "../../../package/core/http/streams/utils/backpressure.utils.js";




describe("backpressure.utils", () => {
    interface MockResponseOptions {
        writableEnded?: boolean;
        destroyed?: boolean;
        write?: (chunk: any, cb?: (err?: Error | null) => void) => boolean;
    }

    function createMockResponse(options: MockResponseOptions = {}): ServerResponse {
        const emitter = new EventEmitter();

        Object.defineProperty(emitter, "writableEnded", {
            value: options.writableEnded ?? false,
            writable: true,
            configurable: true,
        });

        Object.defineProperty(emitter, "destroyed", {
            value: options.destroyed ?? false,
            writable: true,
            configurable: true,
        });

        if (options.write) {
            (emitter as any).write = options.write;
        }

        return emitter as unknown as ServerResponse;
    }

    it("should reject immediately if response is already writableEnded", async () => {
        const res = createMockResponse({ writableEnded: true, destroyed: false });

        await expect(writeWithBackpressure(res, "test chunk")).rejects.toThrow(
            "Cannot write: response already ended",
        );
    });

    it("should reject immediately if response is destroyed", async () => {
        const res = createMockResponse({ writableEnded: false, destroyed: true });

        await expect(writeWithBackpressure(res, "test chunk")).rejects.toThrow(
            "Cannot write: response already ended",
        );
    });

    it("should resolve immediately when write succeeds without backpressure", async () => {
        const writeFn = vi.fn().mockImplementation((_chunk, cb) => {
            if (cb) cb(null);
            return true;
        });

        const res = createMockResponse({
            writableEnded: false,
            destroyed: false,
            write: writeFn,
        });

        await expect(writeWithBackpressure(res, "hello")).resolves.toBeUndefined();
        expect(writeFn).toHaveBeenCalledWith("hello", expect.any(Function));
    });

    it("should wait for 'drain' event when write returns false", async () => {
        // Do NOT invoke cb synchronously so resolution waits for drain
        const writeFn = vi.fn().mockReturnValue(false);

        const res = createMockResponse({
            writableEnded: false,
            destroyed: false,
            write: writeFn,
        });

        let resolved = false;
        const promise = writeWithBackpressure(res, "buffered data").then(() => {
            resolved = true;
        });

        await Promise.resolve();
        expect(resolved).toBe(false);

        res.emit("drain");
        await promise;
        expect(resolved).toBe(true);
    });

    it("should reject when write callback receives an error", async () => {
        const writeErr = new Error("Disk full / socket broken");
        const writeFn = vi.fn().mockImplementation((_chunk, cb) => {
            if (cb) cb(writeErr);
            return true;
        });

        const res = createMockResponse({
            writableEnded: false,
            destroyed: false,
            write: writeFn,
        });

        await expect(writeWithBackpressure(res, "data")).rejects.toThrow("Disk full / socket broken");
    });

    it("should reject when an 'error' event is emitted on the response stream", async () => {
        const writeFn = vi.fn().mockReturnValue(false);

        const res = createMockResponse({
            writableEnded: false,
            destroyed: false,
            write: writeFn,
        });

        const promise = writeWithBackpressure(res, "data");
        res.emit("error", new Error("Socket disconnected unexpectedly"));

        await expect(promise).rejects.toThrow("Socket disconnected unexpectedly");
    });
});