import { describe, expect, it } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import {
    addVaryAcceptEncoding,
    clampInteger,
    DEFAULT_MIME_TYPES,
    getChunkByteLength,
    getHeaderString,
    getStaticMimeType,
    isBodylessResponse,
    NO_BODY_STATUS_CODES,
    normalizeMimeType,
    parseQValue,
} from "../../../package/core/http/compression/utils.js";

describe("utils.ts", () => {
    describe("getChunkByteLength", () => {
        it("returns 0 when chunk is undefined", () => {
            expect(getChunkByteLength(undefined)).toBe(0);
        });

        it("calculates byte length for string chunks with default or custom encoding", () => {
            const str = "hello 🚀";
            expect(getChunkByteLength(str)).toBe(Buffer.byteLength(str, "utf8"));
            expect(getChunkByteLength("abc", "ascii")).toBe(3);
        });

        it("calculates byte length for Buffer chunks", () => {
            const buf = Buffer.from("subatom compression test");
            expect(getChunkByteLength(buf)).toBe(buf.byteLength);
        });

        it("calculates byte length for Uint8Array chunks", () => {
            const uint8 = new Uint8Array([1, 2, 3, 4, 5]);
            expect(getChunkByteLength(uint8)).toBe(5);
        });

        it("returns undefined for unsupported types", () => {
            expect(getChunkByteLength(12345)).toBeUndefined();
            expect(getChunkByteLength({})).toBeUndefined();
            expect(getChunkByteLength(null)).toBeUndefined();
            expect(getChunkByteLength(true)).toBeUndefined();
        });
    });

    describe("clampInteger", () => {
        it("returns fallback when value is not finite (NaN, Infinity, -Infinity)", () => {
            expect(clampInteger(NaN, 0, 10, 5)).toBe(5);
            expect(clampInteger(Infinity, 0, 10, 5)).toBe(5);
            expect(clampInteger(-Infinity, 0, 10, 5)).toBe(5);
        });

        it("clamps value within min and max", () => {
            expect(clampInteger(-5, 0, 10, 5)).toBe(0);
            expect(clampInteger(15, 0, 10, 5)).toBe(10);
            expect(clampInteger(6.8, 0, 10, 5)).toBe(6);
            expect(clampInteger(4, 0, 10, 5)).toBe(4);
        });
    });

    describe("parseQValue", () => {
        it("returns null for empty or whitespace-only strings", () => {
            expect(parseQValue("")).toBeNull();
            expect(parseQValue("   ")).toBeNull();
        });

        it("returns null for non-numeric, out-of-range, or invalid numbers", () => {
            expect(parseQValue("invalid")).toBeNull();
            expect(parseQValue("-0.1")).toBeNull();
            expect(parseQValue("1.001")).toBeNull();
            expect(parseQValue("2")).toBeNull();
        });

        it("returns null when decimal places exceed 3 digits", () => {
            expect(parseQValue("0.1234")).toBeNull();
            expect(parseQValue("0.0001")).toBeNull();
        });

        it("parses valid q-values correctly", () => {
            expect(parseQValue("1")).toBe(1);
            expect(parseQValue("0")).toBe(0);
            expect(parseQValue("0.5")).toBe(0.5);
            expect(parseQValue("0.123")).toBe(0.123);
            expect(parseQValue(" 0.8 ")).toBe(0.8);
        });
    });

    describe("normalizeMimeType", () => {
        it("extracts pure lowercase mime type and strips parameters", () => {
            expect(normalizeMimeType("text/html; charset=UTF-8")).toBe("text/html");
            expect(normalizeMimeType("APPLICATION/JSON ; boundary=something")).toBe("application/json");
            expect(normalizeMimeType("text/plain")).toBe("text/plain");
        });

        it("handles empty or malformed strings gracefully", () => {
            expect(normalizeMimeType("")).toBe("");
        });
    });

    describe("getHeaderString", () => {
        const createRes = () => new ServerResponse(new IncomingMessage(new Socket()));

        it("returns string header value as-is", () => {
            const res = createRes();
            res.setHeader("Content-Type", "text/plain");
            expect(getHeaderString(res, "content-type")).toBe("text/plain");
        });

        it("converts numeric header values to string", () => {
            const res = createRes();
            res.setHeader("Content-Length", 2048);
            expect(getHeaderString(res, "content-length")).toBe("2048");
        });

        it("joins array header values with comma separation", () => {
            const res = createRes();
            res.setHeader("X-Custom", ["val1", "val2"]);
            expect(getHeaderString(res, "x-custom")).toBe("val1, val2");
        });

        it("returns undefined if header is missing", () => {
            const res = createRes();
            expect(getHeaderString(res, "non-existent")).toBeUndefined();
        });
    });

    describe("isBodylessResponse", () => {
        const createPair = (method = "GET", statusCode = 200) => {
            const req = new IncomingMessage(new Socket());
            req.method = method;
            const res = new ServerResponse(req);
            res.statusCode = statusCode;
            return { req, res };
        };

        it("returns true for HEAD requests regardless of status code", () => {
            const { req, res } = createPair("HEAD", 200);
            expect(isBodylessResponse(req, res)).toBe(true);
        });

        it("returns true for 1xx Informational status codes", () => {
            const { req, res } = createPair("GET", 100);
            expect(isBodylessResponse(req, res)).toBe(true);

            res.statusCode = 199;
            expect(isBodylessResponse(req, res)).toBe(true);
        });

        it("returns true for NO_BODY_STATUS_CODES (204, 304)", () => {
            expect(NO_BODY_STATUS_CODES.has(204)).toBe(true);
            expect(NO_BODY_STATUS_CODES.has(304)).toBe(true);

            const { req, res } = createPair("GET", 204);
            expect(isBodylessResponse(req, res)).toBe(true);

            res.statusCode = 304;
            expect(isBodylessResponse(req, res)).toBe(true);
        });

        it("returns false for standard responses with body", () => {
            const { req, res } = createPair("GET", 200);
            expect(isBodylessResponse(req, res)).toBe(false);

            res.statusCode = 404;
            expect(isBodylessResponse(req, res)).toBe(false);

            res.statusCode = 500;
            expect(isBodylessResponse(req, res)).toBe(false);
        });
    });

    describe("addVaryAcceptEncoding", () => {
        const createRes = () => new ServerResponse(new IncomingMessage(new Socket()));

        it("sets Vary to Accept-Encoding if not already present", () => {
            const res = createRes();
            addVaryAcceptEncoding(res);
            expect(res.getHeader("Vary")).toBe("Accept-Encoding");
        });

        it("does nothing if Vary is wildcard '*'", () => {
            const res = createRes();
            res.setHeader("Vary", "*");
            addVaryAcceptEncoding(res);
            expect(res.getHeader("Vary")).toBe("*");
        });

        it("appends Accept-Encoding to existing single string Vary header without duplicating", () => {
            const res = createRes();
            res.setHeader("Vary", "User-Agent");
            addVaryAcceptEncoding(res);
            expect(res.getHeader("Vary")).toBe("User-Agent, Accept-Encoding");

            // Calling again should not duplicate
            addVaryAcceptEncoding(res);
            expect(res.getHeader("Vary")).toBe("User-Agent, Accept-Encoding");
        });

        it("appends Accept-Encoding to array of Vary headers idempotently", () => {
            const res = createRes();
            res.setHeader("Vary", ["Origin, Cookie", "User-Agent"]);
            addVaryAcceptEncoding(res);
            expect(res.getHeader("Vary")).toBe("Origin, Cookie, User-Agent, Accept-Encoding");

            addVaryAcceptEncoding(res);
            expect(res.getHeader("Vary")).toBe("Origin, Cookie, User-Agent, Accept-Encoding");
        });
    });

    describe("getStaticMimeType", () => {
        it("returns mapped content type for known extensions", () => {
            expect(getStaticMimeType("index.html")).toBe("text/html; charset=utf-8");
            expect(getStaticMimeType("style.css")).toBe("text/css; charset=utf-8");
            expect(getStaticMimeType("bundle.js")).toBe("application/javascript; charset=utf-8");
            expect(getStaticMimeType("data.json")).toBe("application/json; charset=utf-8");
            expect(getStaticMimeType("logo.svg")).toBe("image/svg+xml");
            expect(getStaticMimeType("module.wasm")).toBe("application/wasm");
        });

        it("returns application/octet-stream for unknown extensions", () => {
            expect(getStaticMimeType("archive.tar")).toBe("application/octet-stream");
            expect(getStaticMimeType("image.png")).toBe("application/octet-stream");
        });
    });

    describe("DEFAULT_MIME_TYPES", () => {
        it("matches standard web mime types", () => {
            const testTypes = [
                "text/html",
                "text/css",
                "text/plain",
                "application/json",
                "application/javascript",
                "application/xml",
                "application/wasm",
                "image/svg+xml",
            ];

            for (const mime of testTypes) {
                const matches = DEFAULT_MIME_TYPES.some((pattern) => {
                    if (typeof pattern === "string") return pattern === mime;
                    pattern.lastIndex = 0;
                    return pattern.test(mime);
                });
                expect(matches).toBe(true);
            }
        });
    });
});