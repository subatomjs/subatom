import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { ServerResponse } from "node:http";
import { resStream } from "../../../package/core/http/streams/methods/response/resStream.js";

describe("resStream", () => {
    function createMockResponse(overrides: Partial<ServerResponse> = {}) {
        return {
            writableEnded: false,
            headersSent: false,
            statusCode: 200,
            setHeader: vi.fn(),
            end: vi.fn(),
            destroy: vi.fn(),
            on: vi.fn(),
            once: vi.fn(),
            emit: vi.fn(),
            ...overrides,
        } as unknown as ServerResponse;
    }

    it("should destroy readableStream immediately if res.writableEnded is true", () => {
        const res = createMockResponse({ writableEnded: true });
        const source = new PassThrough();
        const destroySpy = vi.spyOn(source, "destroy");

        resStream(res, source);

        expect(destroySpy).toHaveBeenCalled();
    });

    it("should pipe readableStream to response and execute normally", () => {
        const res = createMockResponse();
        const source = new PassThrough();
        const pipeSpy = vi.spyOn(source, "pipe");

        resStream(res, source);

        expect(pipeSpy).toHaveBeenCalledWith(res);
    });

    it("should delegate error to custom onError handler when provided", () => {
        const res = createMockResponse();
        const source = new PassThrough();
        const onError = vi.fn();

        resStream(res, source, { onError });

        const err = new Error("Source stream exploded");
        source.emit("error", err);

        expect(onError).toHaveBeenCalledWith(err);
        expect(res.end).not.toHaveBeenCalled();
    });

    it("should send 500 JSON error when error occurs before headers are sent", () => {
        const res = createMockResponse({ headersSent: false });
        const source = new PassThrough();
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        resStream(res, source);

        const err = new Error("Read failure");
        source.emit("error", err);

        expect(res.statusCode).toBe(500);
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
        expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: "Internal Server Error" }));

        consoleErrorSpy.mockRestore();
    });

    it("should destroy response if error occurs after headers were already sent", () => {
        const res = createMockResponse({ headersSent: true });
        const source = new PassThrough();
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        resStream(res, source);

        const err = new Error("Mid-stream crash");
        source.emit("error", err);

        expect(res.destroy).toHaveBeenCalledWith(err);
        expect(res.end).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
    });
});