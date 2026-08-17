import { describe, it, expect, vi } from "vitest";
import { PassThrough, Readable, Transform } from "node:stream";
import type { ServerResponse } from "node:http";
import {
    pipeToResponse,
    composePipeline,
} from "../../../package/core/http/streams/services/pipeline.service.js";
import { StreamAbortedError } from "../../../package/types/http/IStream.js";

describe("pipeline.service (pipeToResponse & composePipeline)", () => {
    function createMockResponse(overrides: Partial<ServerResponse> = {}) {
        const res = new PassThrough() as unknown as ServerResponse;
        res.statusCode = 200;
        res.setHeader = vi.fn();

        const originalDestroy = res.destroy.bind(res);
        res.destroy = vi.fn((err) => {
            (res as any).destroyed = true;
            originalDestroy(err);
            res.emit("close");
            return res;
        });

        Object.defineProperty(res, "headersSent", {
            value: overrides.headersSent ?? false,
            writable: true,
            configurable: true,
        });

        Object.assign(res, overrides);
        return res;
    }

    describe("composePipeline", () => {
        it("should return the original source stream when no transforms are passed", () => {
            const source = new PassThrough();
            const composed = composePipeline(source);
            expect(composed).toBe(source);
        });

        it("should chain multiple transform streams sequentially", async () => {
            const source = Readable.from(["a", "b", "c"]);
            const t1 = new Transform({
                transform(chunk, _, cb) {
                    cb(null, chunk.toString().toUpperCase());
                },
            });
            const t2 = new Transform({
                transform(chunk, _, cb) {
                    cb(null, `${chunk}!`);
                },
            });

            const composed = composePipeline(source, t1, t2);

            const chunks: string[] = [];
            composed.on("data", (d) => chunks.push(d.toString()));

            await new Promise((resolve) => composed.on("end", resolve));
            expect(chunks.join("")).toBe("A!B!C!");
        });

        it("should return the final downstream transform stream", () => {
            const source = new PassThrough();
            const t1 = new PassThrough();
            const t2 = new PassThrough();

            const composed = composePipeline(source, t1, t2);
            expect(composed).toBe(t2);
        });
    });

    describe("pipeToResponse", () => {
        it("should successfully pipe source stream and call onFinish", async () => {
            const res = createMockResponse();
            const source = Readable.from(["chunk1", "chunk2"]);
            const onFinish = vi.fn();

            await pipeToResponse(res, source, { onFinish });

            expect(onFinish).toHaveBeenCalledTimes(1);
        });

        it("should handle external abort signal cancellation without throwing", async () => {
            const res = createMockResponse();
            const source = new PassThrough();
            const controller = new AbortController();
            const onError = vi.fn();

            const streamPromise = pipeToResponse(res, source, {
                signal: controller.signal,
                onError,
            });

            controller.abort();
            await streamPromise;

            expect(onError).toHaveBeenCalledWith(expect.any(StreamAbortedError));
        });

        it("should handle client disconnect and invoke onClientDisconnect and onError", async () => {
            const res = createMockResponse();
            const source = new PassThrough();
            const onClientDisconnectCallback = vi.fn();
            const onError = vi.fn();

            const streamPromise = pipeToResponse(res, source, {
                onClientDisconnect: onClientDisconnectCallback,
                onError,
            });

            res.emit("close");
            await streamPromise;

            expect(onClientDisconnectCallback).toHaveBeenCalledTimes(1);
            expect(onError).toHaveBeenCalledWith(expect.any(StreamAbortedError));
        });

        it("should throw error if headers have not been sent yet", async () => {
            const res = createMockResponse({ headersSent: false });
            const source = new PassThrough();
            const onError = vi.fn();

            const streamPromise = pipeToResponse(res, source, { onError });
            const error = new Error("Database query stream failed");
            source.destroy(error);

            await expect(streamPromise).rejects.toThrow("Database query stream failed");
            expect(onError).toHaveBeenCalledWith(error);
        });

        it("should destroy response if error occurs after headersSent is true", async () => {
            const res = createMockResponse({ headersSent: true });
            const source = new PassThrough();
            const onError = vi.fn();

            const streamPromise = pipeToResponse(res, source, { onError });
            const error = new Error("Mid-transfer disk read error");
            source.destroy(error);

            await streamPromise;

            expect(onError).toHaveBeenCalledWith(error);
            expect(res.destroy).toHaveBeenCalledWith(error);
        });
    });
});