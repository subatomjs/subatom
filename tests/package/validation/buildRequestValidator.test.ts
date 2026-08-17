import { describe, expect, it, vi } from "vitest";
import { buildRequestValidator } from "../../../package/core/validation/RequestValidator.js";
import { ValidationError } from "../../../package/core/validation/ValidationError.js";

describe("buildRequestValidator", () => {
    it("should pass next() without error when no schemas are defined", async () => {
        const middleware = buildRequestValidator({});
        const req: any = {};
        const res: any = {};
        const next = vi.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith();
    });

    it("should validate all request parts (body, query, params, headers, file, files)", async () => {
        const middleware = buildRequestValidator({
            body: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string" } },
            },
            query: {
                type: "object",
                required: ["page"],
                properties: { page: { type: "string" } },
            },
            params: {
                type: "object",
                required: ["id"],
                properties: { id: { type: "string" } },
            },
            headers: {
                type: "object",
                required: ["authorization"],
                properties: { authorization: { type: "string" } },
            },
            file: {
                type: "file",
                allowedMimeTypes: ["image/png"],
            },
            files: {
                type: "array",
                minItems: 1,
            },
        });

        const validReq: any = {
            body: { name: "Subatom" },
            query: { page: "1" },
            params: { id: "123" },
            headers: { authorization: "Bearer token" },
            file: { mimetype: "image/png" },
            files: [{ mimetype: "image/png" }],
        };
        const nextValid = vi.fn();

        await middleware(validReq, {} as any, nextValid);
        expect(nextValid).toHaveBeenCalledWith();

        const invalidReq: any = {
            body: {},
            query: {},
            params: {},
            headers: {},
            file: { mimetype: "text/plain" },
            files: [],
        };
        const nextInvalid = vi.fn();

        await middleware(invalidReq, {} as any, nextInvalid);

        expect(nextInvalid).toHaveBeenCalledTimes(1);
        const error = nextInvalid.mock.calls[0][0];
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).details).toHaveLength(6);
    });

    it("should aggregate all issues into a single ValidationError", async () => {
        const middleware = buildRequestValidator({
            body: {
                type: "object",
                required: ["a", "b"],
                properties: {
                    a: { type: "string" },
                    b: { type: "number" },
                },
            },
        });

        const req: any = { body: {} };
        const next = vi.fn();

        await middleware(req, {} as any, next);

        const error = next.mock.calls[0][0] as ValidationError;
        expect(error.details.map((d:any) => d.path)).toEqual(["body.a", "body.b"]);
    });
});