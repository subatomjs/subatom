import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { urlencoded } from "../../../package/core/factory-functions/urlencoded.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

function createMockRequest(options: {
    headers?: Record<string, string>;
    bodyChunks?: (string | Buffer)[];
    initialBody?: any;
}): IRequest {
    const raw = Readable.from(
        (options.bodyChunks ?? []).map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))
    ) as any;
    raw.headers = options.headers ?? {};

    return {
        raw,
        body: options.initialBody,
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

describe("URL-Encoded Body Parser Middleware", () => {
    it("should bypass if not application/x-www-form-urlencoded or has no body", async () => {
        const middleware = urlencoded();
        const req = createMockRequest({ headers: { "content-type": "text/plain" } });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should parse standard key-value URL encoded payload and merge into req.body", async () => {
        const middleware = urlencoded();
        const payload = "name=Kunal&roles=admin&roles=dev&active=true";
        const req = createMockRequest({
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "content-length": Buffer.byteLength(payload).toString(),
            },
            bodyChunks: [payload],
            initialBody: { existingKey: "val" },
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({
            existingKey: "val",
            name: "Kunal",
            roles: ["admin", "dev"],
            active: "true",
        });
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should set empty object if payload is whitespace and req.body is unset", async () => {
        const middleware = urlencoded();
        const req = createMockRequest({
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "content-length": "2",
            },
            bodyChunks: ["  "],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({});
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should enforce Content-Length limit guard", async () => {
        const middleware = urlencoded({ limit: "50b" });
        const req = createMockRequest({
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "content-length": "100",
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

    it("should enforce limit during stream read", async () => {
        const middleware = urlencoded({ limit: "15b" });
        const req = createMockRequest({
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "transfer-encoding": "chunked",
            },
            bodyChunks: ["key1=value1&", "key2=value2large"],
        });
        const { res, getStatus } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(getStatus()).toBe(413);
        expect(next).not.toHaveBeenCalled();
    });
});