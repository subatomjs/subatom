import { describe, expect, it } from "vitest";
import { compileBooleanValidator } from "../../../package/core/validation/validators/boolean.validator.js";

describe("compileBooleanValidator", () => {
    it("should accept true and false", async () => {
        const validator = compileBooleanValidator({ type: "boolean" });

        expect(await validator(true, "active")).toHaveLength(0);
        expect(await validator(false, "active")).toHaveLength(0);
    });

    it("should reject non-boolean types", async () => {
        const validator = compileBooleanValidator({ type: "boolean" });

        expect(await validator("true", "active")).toEqual([
            { path: "active", rule: "type", message: "Expected boolean", received: "string" },
        ]);
        expect(await validator(1, "active")).toEqual([
            { path: "active", rule: "type", message: "Expected boolean", received: "number" },
        ]);
        expect(await validator(0, "active")).toEqual([
            { path: "active", rule: "type", message: "Expected boolean", received: "number" },
        ]);
        expect(await validator(null, "active")).toEqual([
            { path: "active", rule: "type", message: "Expected boolean", received: "object" },
        ]);
    });
});