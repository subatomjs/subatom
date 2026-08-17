import { describe, expect, it } from "vitest";
import { compileArrayValidator } from "../../../package/core/validation/validators/array.validator.js";

describe("compileArrayValidator", () => {
    it("should reject non-array values", async () => {
        const validator = compileArrayValidator({ type: "array" });

        const objRes = await validator({}, "items");
        expect(objRes).toEqual([
            { path: "items", rule: "type", message: "Expected array", received: "object" },
        ]);

        const strRes = await validator("[]", "items");
        expect(strRes[0].rule).toBe("type");
    });

    it("should validate minItems and maxItems", async () => {
        const validator = compileArrayValidator({
            type: "array",
            minItems: 2,
            maxItems: 3,
        });

        expect(await validator([1, 2], "list")).toHaveLength(0);
        expect(await validator([1, 2, 3], "list")).toHaveLength(0);

        const underRes = await validator([1], "list");
        expect(underRes).toEqual([
            { path: "list", rule: "minItems", message: "Must contain at least 2 items" },
        ]);

        const overRes = await validator([1, 2, 3, 4], "list");
        expect(overRes).toEqual([
            { path: "list", rule: "maxItems", message: "Must contain at most 3 items" },
        ]);
    });

    it("should recursively validate array items with nested pathing", async () => {
        const validator = compileArrayValidator({
            type: "array",
            items: {
                type: "number",
                minimum: 0,
            },
        });

        expect(await validator([10, 20, 30], "numbers")).toHaveLength(0);

        const failRes = await validator([10, -5, "not-a-number"], "numbers");
        expect(failRes).toHaveLength(2);
        expect(failRes[0]).toEqual({
            path: "numbers[1]",
            rule: "minimum",
            message: "Must be >= 0",
        });
        expect(failRes[1]).toEqual({
            path: "numbers[2]",
            rule: "type",
            message: "Expected number",
            received: "string",
        });
    });

    it("should handle root array pathing when path is empty", async () => {
        const validator = compileArrayValidator({
            type: "array",
            items: { type: "string" },
        });

        const issues = await validator([123], "");
        expect(issues[0].path).toBe("[0]");
    });
});