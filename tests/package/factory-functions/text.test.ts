import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { text } from "../../../package/core/factory-functions/text.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

function createMockRequest(options: {
    headers?: Record<string, string>;
    bodyChunks?: Buffer[];
}): IRequest {
    const rawStream = Readable.from(options.bodyChunks ?? []) as any;
    rawStream.headers = options.headers ?? {};

    return {
        raw: rawStream,
        body: undefined,
    } as unknown as IRequest;
}

function createMockResponse() {
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

describe("Text Body Parser Middleware", () => {
    it("should set empty string and pass if content-type does not match", async () => {
        const middleware = text();
        const req = createMockRequest({
            headers: { "content-type": "application/json", "content-length": "5" },
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toBe("");
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should parse text payload with custom encoding", async () => {
        const middleware = text({ defaultEncoding: "utf-8" });
        const content = "Hello Subatom Framework";
        const req = createMockRequest({
            headers: {
                "content-type": "text/plain",
                "content-length": Buffer.byteLength(content).toString(),
            },
            bodyChunks: [Buffer.from(content, "utf-8")],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toBe(content);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should handle custom accepted types array (e.g. text/html, text/csv)", async () => {
        const middleware = text({ type: ["text/html", "text/csv"] });
        const csv = "id,name\n1,Kunal";
        const req = createMockRequest({
            headers: {
                "content-type": "text/csv",
                "content-length": csv.length.toString(),
            },
            bodyChunks: [Buffer.from(csv)],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toBe(csv);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should reject payload exceeding byte limit", async () => {
        const middleware = text({ limit: "5b" });
        const req = createMockRequest({
            headers: {
                "content-type": "text/plain",
                "content-length": "100",
            },
        });
        const { res, getStatus } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(getStatus()).toBe(413);
        expect(next).not.toHaveBeenCalled();
    });
});