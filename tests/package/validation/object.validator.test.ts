import { describe, expect, it } from "vitest";
import { compileObjectValidator } from "../../../package/core/validation/validators/object.validator.js";

describe("compileObjectValidator", () => {
	it("should reject non-object and array types", async () => {
		const validator = compileObjectValidator({ type: "object" });

		expect(await validator(null, "user")).toEqual([
			{
				path: "user",
				rule: "type",
				message: "Expected object",
				received: "object",
			},
		]);
		expect(await validator([], "user")).toEqual([
			{
				path: "user",
				rule: "type",
				message: "Expected object",
				received: "object",
			},
		]);
		expect(await validator("string", "user")).toEqual([
			{
				path: "user",
				rule: "type",
				message: "Expected object",
				received: "string",
			},
		]);
	});

	it("should enforce required fields", async () => {
		const validator = compileObjectValidator({
			type: "object",
			required: ["id", "email"],
		});

		expect(await validator({ id: 1, email: "a@b.com" }, "data")).toHaveLength(
			0,
		);

		const missingRes = await validator({ id: 1 }, "data");
		expect(missingRes).toEqual([
			{
				path: "data.email",
				rule: "required",
				message: "Missing required property: email",
			},
		]);

		const nullRequiredRes = await validator({ id: null, email: undefined }, "");
		expect(nullRequiredRes).toEqual([
			{
				path: "id",
				rule: "required",
				message: "Missing required property: id",
			},
			{
				path: "email",
				rule: "required",
				message: "Missing required property: email",
			},
		]);
	});

	it("should validate nested properties", async () => {
		const validator = compileObjectValidator({
			type: "object",
			properties: {
				user: {
					type: "object",
					required: ["name"],
					properties: {
						name: { type: "string", minLength: 2 },
					},
				},
			},
		});

		expect(await validator({ user: { name: "Bob" } }, "payload")).toHaveLength(
			0,
		);

		const failRes = await validator({ user: { name: "A" } }, "payload");
		expect(failRes).toEqual([
			{
				path: "payload.user.name",
				rule: "minLength",
				message: "Must be at least 2 characters",
				expected: 2,
			},
		]);
	});

	it("should prevent prototype pollution traversal", async () => {
		const validator = compileObjectValidator({
			type: "object",
			properties: {
				__proto__: { type: "string" },
				constructor: { type: "string" },
				validProp: { type: "string" },
			},
		});

		const res = await validator({ validProp: "ok" }, "obj");
		expect(res).toHaveLength(0);
	});
});
