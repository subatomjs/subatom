import { describe, expect, it } from "vitest";
import { compileNumberValidator } from "../../../package/core/validation/validators/number.validator.js";

describe("compileNumberValidator", () => {
	it("should reject non-number types and NaN", async () => {
		const numberVal = compileNumberValidator({ type: "number" });
		const intVal = compileNumberValidator({ type: "integer" });

		expect(await numberVal("123", "num")).toEqual([
			{
				path: "num",
				rule: "type",
				message: "Expected number",
				received: "string",
			},
		]);
		expect(await numberVal(NaN, "num")).toEqual([
			{
				path: "num",
				rule: "type",
				message: "Expected number",
				received: "number",
			},
		]);
		expect(await intVal("123", "int")).toEqual([
			{
				path: "int",
				rule: "type",
				message: "Expected integer",
				received: "string",
			},
		]);
	});

	it("should validate integer constraints", async () => {
		const intVal = compileNumberValidator({ type: "integer" });

		expect(await intVal(42, "count")).toHaveLength(0);
		expect(await intVal(0, "count")).toHaveLength(0);
		expect(await intVal(-10, "count")).toHaveLength(0);

		const floatRes = await intVal(42.5, "count");
		expect(floatRes).toEqual([
			{
				path: "count",
				rule: "type",
				message: "Expected integer, received float",
				received: 42.5,
			},
		]);
	});

	it("should validate minimum and maximum inclusive boundaries", async () => {
		const validator = compileNumberValidator({
			type: "number",
			minimum: 10,
			maximum: 20,
		});

		expect(await validator(10, "val")).toHaveLength(0);
		expect(await validator(15, "val")).toHaveLength(0);
		expect(await validator(20, "val")).toHaveLength(0);

		const underRes = await validator(9.99, "val");
		expect(underRes).toEqual([
			{ path: "val", rule: "minimum", message: "Must be >= 10" },
		]);

		const overRes = await validator(20.01, "val");
		expect(overRes).toEqual([
			{ path: "val", rule: "maximum", message: "Must be <= 20" },
		]);
	});

	it("should validate exclusiveMinimum and exclusiveMaximum boundaries", async () => {
		const validator = compileNumberValidator({
			type: "number",
			exclusiveMinimum: 10,
			exclusiveMaximum: 20,
		});

		expect(await validator(10.001, "val")).toHaveLength(0);
		expect(await validator(19.999, "val")).toHaveLength(0);

		const eqMinRes = await validator(10, "val");
		expect(eqMinRes).toEqual([
			{ path: "val", rule: "exclusiveMinimum", message: "Must be > 10" },
		]);

		const eqMaxRes = await validator(20, "val");
		expect(eqMaxRes).toEqual([
			{ path: "val", rule: "exclusiveMaximum", message: "Must be < 20" },
		]);
	});

	it("should validate enum constraints for numbers", async () => {
		const validator = compileNumberValidator({
			type: "number",
			enum: [1, 2, 3, 5, 8],
		});

		expect(await validator(5, "fib")).toHaveLength(0);

		const failRes = await validator(4, "fib");
		expect(failRes).toEqual([
			{ path: "fib", rule: "enum", message: "Must be one of: 1, 2, 3, 5, 8" },
		]);
	});
});
