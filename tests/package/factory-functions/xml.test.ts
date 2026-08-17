import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { xml } from "../../../package/core/factory-functions/xml.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

function createMockRequest(options: {
    headers?: Record<string, string>;
    bodyChunks?: string[];
}): IRequest {
    const rawStream = Readable.from(
        (options.bodyChunks ?? []).map((c) => Buffer.from(c))
    ) as any;
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

describe("Native XML Body Parser Middleware", () => {
    it("should bypass if not XML content-type", async () => {
        const middleware = xml();
        const req = createMockRequest({
            headers: { "content-type": "application/json", "content-length": "10" },
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({});
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should parse basic XML document with attributes and text", async () => {
        const middleware = xml();
        const xmlData = `
            <?xml version="1.0" encoding="UTF-8"?>
            <!-- Comment to ignore -->
            <user id="101" role="admin">
                <name>Kunal &amp; Team</name>
                <active>true</active>
            </user>
        `;
        const req = createMockRequest({
            headers: {
                "content-type": "application/xml",
                "content-length": xmlData.length.toString(),
            },
            bodyChunks: [xmlData],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({
            user: {
                "@_id": "101",
                "@_role": "admin",
                name: "Kunal & Team",
                active: "true",
            },
        });
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should parse CDATA sections and repeated elements into arrays", async () => {
        const middleware = xml();
        const xmlData = `<root><item>First</item><item>Second</item><description><![CDATA[Raw <Unescaped> Text]]></description></root>`;
        const req = createMockRequest({
            headers: {
                "content-type": "text/xml",
                "content-length": xmlData.length.toString(),
            },
            bodyChunks: [xmlData],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect((req.body as any).root).toBeDefined();
        expect((req.body as any).root.item).toEqual(["First", "Second"]);
        expect((req.body as any).root.description).toBeDefined();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should parse self-closing tags with and without attributes", async () => {
        const middleware = xml();
        const xmlData = `<root><item enabled="true"/><item enabled="false"/></root>`;
        const req = createMockRequest({
            headers: {
                "content-type": "application/xml",
                "content-length": xmlData.length.toString(),
            },
            bodyChunks: [xmlData],
        });
        const { res } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(req.body).toEqual({
            root: {
                "@_enabled": ["true", "false"],
            },
        });
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should return 400 on malformed XML or mismatched tags", async () => {
        const middleware = xml();
        const malformedXml = `<root><openTag>Text</mismatchedTag></root>`;
        const req = createMockRequest({
            headers: {
                "content-type": "application/xml",
                "content-length": malformedXml.length.toString(),
            },
            bodyChunks: [malformedXml],
        });
        const { res, getStatus, getJson } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(getStatus()).toBe(400);
        expect(getJson()).toEqual({ success: false, message: "Bad Request: Invalid XML Payload" });
        expect(next).not.toHaveBeenCalled();
    });

    it("should return 413 on payload limit overflow", async () => {
        const middleware = xml({ limit: "10b" });
        const req = createMockRequest({
            headers: {
                "content-type": "application/xml",
                "content-length": "100",
            },
            bodyChunks: ["<veryLargePayload>XML</veryLargePayload>"],
        });
        const { res, getStatus } = createMockResponse();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(getStatus()).toBe(413);
        expect(next).not.toHaveBeenCalled();
    });
});