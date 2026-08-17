import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SchemaValidator } from "../../../package/core/validation/SchemaValidator.js";

describe("SchemaValidator", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should return empty issues for null or non-object schemas", async () => {
		const nullValidator = SchemaValidator.compile(null);
		expect(await nullValidator("any", "path")).toEqual([]);

		const strValidator = SchemaValidator.compile("invalid-schema" as any);
		expect(await strValidator("any", "path")).toEqual([]);
	});

	it("should handle nullable schemas correctly", async () => {
		const nonNullableValidator = SchemaValidator.compile({
			type: "string",
			nullable: false,
		});
		expect(await nonNullableValidator(null, "field")).toEqual([
			{
				path: "field",
				rule: "nullable",
				message: "Value cannot be null or undefined",
			},
		]);
		expect(await nonNullableValidator(undefined, "field")).toEqual([
			{
				path: "field",
				rule: "nullable",
				message: "Value cannot be null or undefined",
			},
		]);

		const nullableValidator = SchemaValidator.compile({
			type: "string",
			nullable: true,
		});
		expect(await nullableValidator(null, "field")).toHaveLength(0);
		expect(await nullableValidator(undefined, "field")).toHaveLength(0);
	});

	it("should fallback to no-op for unknown schema types", async () => {
		const unknownValidator = SchemaValidator.compile({ type: "unknown_type" });
		expect(await unknownValidator("any-value", "field")).toHaveLength(0);
	});

	it("should warn if custom rule is not registered", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		SchemaValidator.compile({ type: "string", custom: "unregisteredRule" });

		expect(warnSpy).toHaveBeenCalledWith(
			'[Subatom Validator] Custom rule "unregisteredRule" was requested but not registered.',
		);
	});

	it("should execute registered custom validation rule when structural validation succeeds", async () => {
		SchemaValidator.registerRule("isEvenNumber", async (value) => {
			if (typeof value === "number" && value % 2 !== 0) {
				return "Value must be an even number";
			}
			return null;
		});

		const validator = SchemaValidator.compile({
			type: "number",
			custom: "isEvenNumber",
		});

		expect(await validator(4, "num")).toHaveLength(0);

		const failRes = await validator(3, "num");
		expect(failRes).toEqual([
			{ path: "num", rule: "custom", message: "Value must be an even number" },
		]);
	});

	it("should NOT execute custom rule if type validation fails first", async () => {
		const customFn = vi.fn().mockResolvedValue("Custom error");
		SchemaValidator.registerRule("checkCustom", customFn);

		const validator = SchemaValidator.compile({
			type: "number",
			custom: "checkCustom",
		});

		const issues = await validator("not-a-number", "num");
		expect(issues[0].rule).toBe("type");
		expect(customFn).not.toHaveBeenCalled();
	});
});
