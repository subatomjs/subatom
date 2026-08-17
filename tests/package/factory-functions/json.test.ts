import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { json } from "../../../package/core/factory-functions/json.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

function createMockRequest(options: {
    headers?: Record<string, string>;
    bodyChunks?: (string | Buffer)[];
}): IRequest {
    const raw = Readable.from(
        (options.bodyChunks ?? []).map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))
    ) as any;
    raw.headers = options.headers ?? {};

    return {
        raw,
        body: undefined,
    } as unknown as IRequest;
}

function createMockResponse(): { res: IResponse; getStatus: () => number; getJson: () => any } {
    let statusCode = 200;
    let jsonBody: any = null;

    const res = {
        status(code: number) {
            statusCode = code;
            return this;
        },
        json(data: any) {
            jsonBody = data;
            return this;
        },
    } as unknown as IResponse;

    return {
        res,
        getStatus: () => statusCode,
        getJson: () => jsonBody,
    };
}

describe("JSON Body Parser Middleware", () => {
    it("should bypass and set req.body = {} if request has no body or not application/json", async () => {
        const middleware = json();
        const req = createMockRequest({ headers: {} });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({});
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should parse valid JSON payload successfully", async () => {
        const middleware = json();
        const payload = JSON.stringify({ framework: "Subatom", fast: true });
        const req = createMockRequest({
            headers: {
                "content-type": "application/json; charset=utf-8",
                "content-length": Buffer.byteLength(payload).toString(),
            },
            bodyChunks: [payload],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({ framework: "Subatom", fast: true });
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should parse multi-chunk JSON stream payload", async () => {
        const middleware = json();
        const chunk1 = '{"user": "';
        const chunk2 = 'Kunal", "id": 101}';
        const totalLength = Buffer.byteLength(chunk1 + chunk2).toString();

        const req = createMockRequest({
            headers: {
                "content-type": "application/json",
                "content-length": totalLength,
            },
            bodyChunks: [chunk1, chunk2],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({ user: "Kunal", id: 101 });
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should handle empty JSON payload gracefully", async () => {
        const middleware = json();
        const req = createMockRequest({
            headers: {
                "content-type": "application/json",
                "content-length": "0",
            },
            bodyChunks: ["   "],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({});
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should reject early with 413 if Content-Length header exceeds limit", async () => {
        const middleware = json({ limit: "1kb" });
        const req = createMockRequest({
            headers: {
                "content-type": "application/json",
                "content-length": "2048",
            },
            bodyChunks: [],
        });
        const { res, getStatus, getJson } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(getStatus()).toBe(413);
        expect(getJson()).toEqual({ success: false, message: "Payload Too Large" });
        expect(next).not.toHaveBeenCalled();
    });

    it("should reject with 413 if streaming data exceeds limit (chunked/transfer-encoding)", async () => {
        const middleware = json({ limit: "10b" });
        const req = createMockRequest({
            headers: {
                "content-type": "application/json",
                "transfer-encoding": "chunked",
            },
            bodyChunks: ["123456", "789012345"],
        });
        const { res, getStatus, getJson } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(getStatus()).toBe(413);
        expect(getJson()).toEqual({ success: false, message: "Payload Too Large" });
        expect(next).not.toHaveBeenCalled();
    });

    it("should return 400 on malformed JSON", async () => {
        const middleware = json();
        const req = createMockRequest({
            headers: {
                "content-type": "application/json",
                "content-length": "10",
            },
            bodyChunks: ["{ invalid: json "],
        });
        const { res, getStatus, getJson } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(getStatus()).toBe(400);
        expect(getJson()).toEqual({ success: false, message: "Bad Request: Invalid JSON Payload" });
        expect(next).not.toHaveBeenCalled();
    });
});