import { describe, it, expect } from "vitest";
import { normalizeError } from "../../../../package/core/router/services/errorNormalizer.service.js";
import { SubatomError } from "../../../../package/core/http/errors/Error.js";

describe("Unit: errorNormalizer.service", () => {
    it("should return the exact error if input is an instance of Error", () => {
        const error = new Error("Custom error");
        expect(normalizeError(error)).toBe(error);
    });

    it("should wrap string primitives in SubatomError", () => {
        const res = normalizeError("Something failed");
        expect(res).toBeInstanceOf(SubatomError);
        expect(res.message).toBe("Something failed");
    });

    it("should wrap objects/numbers/unknown types in SubatomError with details", () => {
        const details = { code: 500 };
        const res = normalizeError(details) as SubatomError & { details: unknown };
        expect(res).toBeInstanceOf(SubatomError);
        expect(res.message).toBe("A non-Error value was thrown during request handling.");
        expect(res.details).toEqual(details);
    });
});