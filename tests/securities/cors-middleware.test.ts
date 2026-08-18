import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCors } from "../../package/core/securities/cross-origin/corsMiddleware.js";
import type { IRequest } from "../../package/types/http/IRequest.js";
import type { IResponse } from "../../package/types/http/IResponse.js";
import type { NextFunction } from "../../package/types/framework/pipeline/INext.js";

// Helper type to bypass readonly constraints during mock setup
type Writable<T> = { -readonly [P in keyof T]: T[P] };

describe("CORS Middleware - Integration Tests", () => {
    let mockReq: any;
    let mockRes: Partial<IResponse> & Record<string, any>;
    let next: NextFunction;
    let headersMap: Record<string, string>;
    let varyHeaders: string[];

    const createMockRequest = (overrides: Record<string, any> = {}): any => ({
        raw: {
            headers: {},
            method: "GET",
            ...overrides.raw,
        },
        headers: {},
        method: "GET",
        ...overrides,
    });

    beforeEach(() => {
        headersMap = {};
        varyHeaders = [];

        mockReq = createMockRequest();

        mockRes = {
            setHeader: vi.fn((key: string, val: string | string[]) => {
                headersMap[key.toLowerCase()] = Array.isArray(val) ? val.join(",") : String(val);
                return mockRes as IResponse;
            }),
            vary: vi.fn((header: string) => {
                varyHeaders.push(header);
                return mockRes as IResponse;
            }),
            status: vi.fn().mockReturnThis(),
            end: vi.fn().mockReturnThis(),
        };

        next = vi.fn().mockImplementation(async () => {});
    });

    describe("Missing Origin Behavior", () => {
        it("should bypass CORS headers and call next() if no origin header is present", async () => {
            const middleware = createCors();

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(mockRes.vary).not.toHaveBeenCalled();
            expect(mockRes.setHeader).not.toHaveBeenCalled();
        });

        it("should fall back to top-level req.headers if req.raw is undefined", async () => {
            mockReq = {
                raw: undefined,
                headers: { origin: "https://subatom.dev" },
                method: "GET",
            };

            const middleware = createCors({ origin: "*" });
            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(mockRes.vary).toHaveBeenCalledWith("Origin");
            expect(headersMap["access-control-allow-origin"]).toBe("*");
            expect(next).toHaveBeenCalledTimes(1);
        });

        it("should default HTTP method to GET if raw.method and req.method are both undefined", async () => {
            mockReq = {
                raw: { headers: { origin: "https://subatom.dev" }, method: undefined },
                headers: {},
                method: undefined,
            };

            const middleware = createCors({ origin: "*" });
            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(mockRes.vary).toHaveBeenCalledWith("Origin");
            expect(headersMap["access-control-allow-origin"]).toBe("*");
            expect(next).toHaveBeenCalledTimes(1);
        });
    });

    describe("Origin Resolution & Header Setting", () => {
        it("should set Access-Control-Allow-Origin to '*' with default options", async () => {
            mockReq = createMockRequest({
                raw: { headers: { origin: "https://subatom.dev" }, method: "GET" },
            });
            const middleware = createCors();

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(mockRes.vary).toHaveBeenCalledWith("Origin");
            expect(headersMap["access-control-allow-origin"]).toBe("*");
            expect(next).toHaveBeenCalledTimes(1);
        });

        it("should reflect request origin when wildcard '*' is used with credentials: true", async () => {
            mockReq = createMockRequest({
                raw: { headers: { origin: "https://subatom.dev" }, method: "GET" },
            });
            const middleware = createCors({
                origin: "*",
                credentials: true,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-origin"]).toBe("https://subatom.dev");
            expect(headersMap["access-control-allow-credentials"]).toBe("true");
            expect(next).toHaveBeenCalledTimes(1);
        });

        it("should set exact allowed origin string when string origin matches", async () => {
            mockReq = createMockRequest({
                raw: { headers: { origin: "https://subatom.dev" }, method: "GET" },
            });
            const middleware = createCors({
                origin: "https://subatom.dev",
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-origin"]).toBe("https://subatom.dev");
        });

        it("should set request origin when origin boolean is true", async () => {
            mockReq = createMockRequest({
                raw: { headers: { origin: "https://dynamic.subatom.dev" }, method: "GET" },
            });
            const middleware = createCors({
                origin: true,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-origin"]).toBe("https://dynamic.subatom.dev");
        });

        it("should not set Access-Control-Allow-Origin header if origin is disallowed", async () => {
            mockReq = createMockRequest({
                raw: { headers: { origin: "https://unauthorized.dev" }, method: "GET" },
            });
            const middleware = createCors({
                origin: "https://subatom.dev",
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-origin"]).toBeUndefined();
            expect(next).toHaveBeenCalledTimes(1);
        });
    });

    describe("Exposed Headers", () => {
        it("should set Access-Control-Expose-Headers when exposedHeaders array is passed", async () => {
            mockReq = createMockRequest({
                raw: { headers: { origin: "https://subatom.dev" }, method: "GET" },
            });
            const middleware = createCors({
                exposedHeaders: ["X-Custom-Header", "X-Trace-Id"],
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-expose-headers"]).toBe("X-Custom-Header,X-Trace-Id");
        });

        it("should set Access-Control-Expose-Headers when exposedHeaders string is passed", async () => {
            mockReq = createMockRequest({
                raw: { headers: { origin: "https://subatom.dev" }, method: "GET" },
            });
            const middleware = createCors({
                exposedHeaders: "X-Total-Count, X-Page",
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-expose-headers"]).toBe("X-Total-Count, X-Page");
        });

        it("should omit Access-Control-Expose-Headers when exposedHeaders normalizes to empty", async () => {
            mockReq = createMockRequest({
                raw: { headers: { origin: "https://subatom.dev" }, method: "GET" },
            });
            const middleware = createCors({
                exposedHeaders: [],
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-expose-headers"]).toBeUndefined();
        });
    });

    describe("Preflight Request Handling (OPTIONS Method)", () => {
        beforeEach(() => {
            mockReq = createMockRequest({
                raw: {
                    method: "OPTIONS",
                    headers: {
                        origin: "https://subatom.dev",
                        "access-control-request-headers": "authorization, content-type",
                    },
                },
                method: "OPTIONS",
            });
        });

        it("should set Access-Control-Allow-Methods with configured methods", async () => {
            const middleware = createCors({
                methods: ["GET", "POST", "PUT"],
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-methods"]).toBe("GET,POST,PUT");
            expect(mockRes.status).toHaveBeenCalledWith(204);
            expect(mockRes.end).toHaveBeenCalledTimes(1);
            expect(next).not.toHaveBeenCalled();
        });

        it("should set Access-Control-Allow-Methods when passed as a single string", async () => {
            const middleware = createCors({
                methods: "GET, POST" as any,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-methods"]).toBe("GET, POST");
        });

        it("should set explicit Access-Control-Allow-Headers when provided as array", async () => {
            const middleware = createCors({
                allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key"],
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-headers"]).toBe("Content-Type,Authorization,X-Api-Key");
            expect(mockRes.vary).not.toHaveBeenCalledWith("Access-Control-Request-Headers");
        });

        it("should set explicit Access-Control-Allow-Headers when provided as string", async () => {
            const middleware = createCors({
                allowedHeaders: "Content-Type, Authorization",
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-headers"]).toBe("Content-Type, Authorization");
        });

        it("should echo request headers and add Vary when allowedHeaders is empty", async () => {
            const middleware = createCors({
                allowedHeaders: [],
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-headers"]).toBe("authorization, content-type");
            expect(mockRes.vary).toHaveBeenCalledWith("Access-Control-Request-Headers");
        });

        it("should read access-control-request-headers from req.headers if raw is absent", async () => {
            mockReq = {
                raw: undefined,
                method: "OPTIONS",
                headers: {
                    origin: "https://subatom.dev",
                    "access-control-request-headers": "x-session-token",
                },
            };

            const middleware = createCors({ allowedHeaders: [] });
            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-headers"]).toBe("x-session-token");
            expect(mockRes.vary).toHaveBeenCalledWith("Access-Control-Request-Headers");
        });

        it("should not set Access-Control-Allow-Headers if no allowedHeaders configured and no request headers provided", async () => {
            mockReq = createMockRequest({
                raw: {
                    method: "OPTIONS",
                    headers: { origin: "https://subatom.dev" },
                },
            });
            const middleware = createCors({ allowedHeaders: [] });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-allow-headers"]).toBeUndefined();
            expect(mockRes.vary).not.toHaveBeenCalledWith("Access-Control-Request-Headers");
        });

        it("should set Access-Control-Max-Age when maxAge is a non-negative number", async () => {
            const middleware = createCors({
                maxAge: 86400,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-max-age"]).toBe("86400");
        });

        it("should accept maxAge = 0", async () => {
            const middleware = createCors({
                maxAge: 0,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-max-age"]).toBe("0");
        });

        it("should omit Access-Control-Max-Age when maxAge is negative or not a number", async () => {
            const middleware = createCors({
                maxAge: -10,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(headersMap["access-control-max-age"]).toBeUndefined();
        });

        it("should respect optionsSuccessStatus custom code", async () => {
            const middleware = createCors({
                optionsSuccessStatus: 200,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.end).toHaveBeenCalledTimes(1);
            expect(next).not.toHaveBeenCalled();
        });

        it("should default optionsSuccessStatus to 204 if nullish", async () => {
            const middleware = createCors({
                optionsSuccessStatus: undefined,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(mockRes.status).toHaveBeenCalledWith(204);
            expect(mockRes.end).toHaveBeenCalledTimes(1);
        });

        it("should continue down the pipeline when preflightContinue is true", async () => {
            const middleware = createCors({
                preflightContinue: true,
            });

            await middleware(mockReq as IRequest, mockRes as IResponse, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(mockRes.status).not.toHaveBeenCalled();
            expect(mockRes.end).not.toHaveBeenCalled();
        });
    });
});