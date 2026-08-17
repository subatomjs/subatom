import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { ServerResponse } from "node:http";
import { resSendStream } from "../../../package/core/http/streams/methods/response/resSendStream.js";






describe("resSendStream", () => {
    function createMockResponse(overrides: Partial<ServerResponse> = {}) {
        const res = new PassThrough() as unknown as ServerResponse;
        res.statusCode = 200;
        res.setHeader = vi.fn();
        res.end = vi.fn();
        res.destroy = vi.fn();
        Object.defineProperty(res, "headersSent", {
            value: overrides.headersSent ?? false,
            writable: true,
            configurable: true,
        });
        Object.assign(res, overrides);
        return res;
    }

    it("should throw error if headers are already sent", () => {
        const res = createMockResponse({ headersSent: true });
        const source = new PassThrough();

        expect(() => resSendStream(res, source)).toThrow(
            "[Subatom Stream Error]: Headers already sent before resSendStream invocation.",
        );
    });

    it("should set custom statusCode, contentType, and contentLength headers", () => {
        const res = createMockResponse();
        const source = new PassThrough();

        resSendStream(res, source, {
            statusCode: 206,
            contentType: "video/mp4",
            contentLength: 1048576,
        });

        expect(res.statusCode).toBe(206);
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "video/mp4");
        expect(res.setHeader).toHaveBeenCalledWith("Content-Length", "1048576");
    });

    it("should send 500 error payload on stream failure before headersSent", () => {
        const res = createMockResponse();
        const source = new PassThrough();

        resSendStream(res, source);

        source.emit("error", new Error("Chunk read error"));

        expect(res.statusCode).toBe(500);
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
        expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: "Stream transmission failed." }));
    });

    it("should destroy response on stream error after headersSent", () => {
        const res = createMockResponse();
        const source = new PassThrough();

        resSendStream(res, source);

        (res as any).headersSent = true;
        const streamErr = new Error("Socket broken mid-flight");
        source.emit("error", streamErr);

        expect(res.destroy).toHaveBeenCalledWith(streamErr);
    });
});