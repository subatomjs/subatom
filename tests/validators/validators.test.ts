import { describe, test, expect, vi, beforeEach } from "vitest";
import { SchemaValidator } from "../../packages/validations/SchemaValidator.js";
import { compileStringValidator } from "../../packages/validations/validators/string.validator.js";
import { compileNumberValidator } from "../../packages/validations/validators/number.validator.js";
import { compileBooleanValidator } from "../../packages/validations/validators/boolean.validator.js";
import { compileArrayValidator } from "../../packages/validations/validators/array.validator.js";
import { compileObjectValidator } from "../../packages/validations/validators/object.validator.js";
import { compileFileValidator } from "../../packages/validations/validators/file.validator.js";
import { ErrorValidator } from "../../packages/validations/ErrorValidator.js";
import type { ISchemaBase, SchemaValidatorObject, ValidationIssue } from "../../packages/validations/types/validator.types.js";

describe("ErrorValidator", () => {
	test("initializes with 422 status, code, details, and ValidationError name", () => {
		const issues = [{ path: "email", rule: "format", message: "Invalid email" }];
		const err = new ErrorValidator(issues);

		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("ValidationError");
		expect(err.statusCode).toBe(422);
		expect(err.errorCode).toBe("VALIDATION_ERROR");
		expect(err.details).toBe(issues);
		expect(err.isOperational).toBe(true);
	});
});

describe("String Validator", () => {
	test("rejects non-string values", async () => {
		const validate = compileStringValidator({});
		const issues = await validate(123, "username");
		expect(issues).toEqual([
			{ path: "username", rule: "type", message: "Expected string", received: "number" },
		]);
	});

	test("validates minLength and maxLength", async () => {
		const validate = compileStringValidator({ minLength: 3, maxLength: 5 });
		expect(await validate("hi", "field")).toHaveLength(1);
		expect(await validate("hello", "field")).toHaveLength(0);
		expect(await validate("toolong", "field")).toHaveLength(1);
	});

	test("validates regex pattern", async () => {
		const validate = compileStringValidator({ pattern: "^[A-Z]+$" });
		expect(await validate("abc", "code")).toHaveLength(1);
		expect(await validate("ABC", "code")).toHaveLength(0);
	});

	test("validates enum options", async () => {
		const validate = compileStringValidator({ enum: ["admin", "user"] });
		expect(await validate("guest", "role")).toHaveLength(1);
		expect(await validate("admin", "role")).toHaveLength(0);
	});

	test("validates formats (email, url, uri, uuid, date, ipv4)", async () => {
		const emailVal = compileStringValidator({ format: "email" });
		expect(await emailVal("not-an-email", "email")).toHaveLength(1);
		expect(await emailVal("test@example.com", "email")).toHaveLength(0);

		const urlVal = compileStringValidator({ format: "url" });
		expect(await urlVal("invalid-url", "url")).toHaveLength(1);
		expect(await urlVal("https://subatomjs.dev", "url")).toHaveLength(0);

		const uriVal = compileStringValidator({ format: "uri" });
		expect(await uriVal("ftp://subatomjs.dev", "uri")).toHaveLength(0);

		const uuidVal = compileStringValidator({ format: "uuid" });
		expect(await uuidVal("invalid-uuid", "uuid")).toHaveLength(1);
		expect(await uuidVal("c9a646d3-9c61-4cc9-bc53-ae82f1b07f1a", "uuid")).toHaveLength(0);

		const dateVal = compileStringValidator({ format: "date" });
		expect(await dateVal("2026/09/06", "date")).toHaveLength(1);
		expect(await dateVal("2026-09-06", "date")).toHaveLength(0);

		const ipVal = compileStringValidator({ format: "ipv4" });
		expect(await ipVal("999.999.999.999", "ip")).toHaveLength(1);
		expect(await ipVal("127.0.0.1", "ip")).toHaveLength(0);
	});
});

describe("Number Validator", () => {
	test("rejects non-number values and NaN", async () => {
		const validate = compileNumberValidator({});
		expect(await validate("123", "age")).toHaveLength(1);
		expect(await validate(Number.NaN, "age")).toHaveLength(1);
	});

	test("enforces integer type when specified", async () => {
		const validate = compileNumberValidator({ type: "integer" });
		expect(await validate(10.5, "count")).toEqual([
			{ path: "count", rule: "type", message: "Expected integer, received float", received: 10.5 },
		]);
		expect(await validate(10, "count")).toHaveLength(0);
	});

	test("validates minimum and maximum boundaries", async () => {
		const validate = compileNumberValidator({ minimum: 10, maximum: 20 });
		expect(await validate(9, "val")).toHaveLength(1);
		expect(await validate(10, "val")).toHaveLength(0);
		expect(await validate(20, "val")).toHaveLength(0);
		expect(await validate(21, "val")).toHaveLength(1);
	});

	test("validates exclusiveMinimum and exclusiveMaximum boundaries", async () => {
		const validate = compileNumberValidator({ exclusiveMinimum: 10, exclusiveMaximum: 20 });
		expect(await validate(10, "val")).toHaveLength(1);
		expect(await validate(11, "val")).toHaveLength(0);
		expect(await validate(19, "val")).toHaveLength(0);
		expect(await validate(20, "val")).toHaveLength(1);
	});

	test("validates enum options", async () => {
		const validate = compileNumberValidator({ enum: [1, 2, 3] });
		expect(await validate(4, "level")).toHaveLength(1);
		expect(await validate(2, "level")).toHaveLength(0);
	});
});

describe("Boolean Validator", () => {
	test("validates boolean types correctly", async () => {
		const validate = compileBooleanValidator({});
		expect(await validate("true", "flag")).toEqual([
			{ path: "flag", rule: "type", message: "Expected boolean", received: "string" },
		]);
		expect(await validate(true, "flag")).toHaveLength(0);
		expect(await validate(false, "flag")).toHaveLength(0);
	});
});

describe("Array Validator", () => {
	test("rejects non-array inputs", async () => {
		const validate = compileArrayValidator({});
		expect(await validate("not-array", "list")).toEqual([
			{ path: "list", rule: "type", message: "Expected array", received: "string" },
		]);
	});

	test("validates minItems and maxItems", async () => {
		const validate = compileArrayValidator({ minItems: 2, maxItems: 3 });
		expect(await validate([1], "list")).toHaveLength(1);
		expect(await validate([1, 2], "list")).toHaveLength(0);
		expect(await validate([1, 2, 3, 4], "list")).toHaveLength(1);
	});

	test("recursively validates array elements with correct paths", async () => {
		const validate = compileArrayValidator({
			items: { type: "number" },
		});
		const issues = await validate([10, "invalid", 30], "users");
		expect(issues).toEqual([
			{ path: "users[1]", rule: "type", message: "Expected number", received: "string" },
		]);

		const issuesEmptyPath = await validate(["invalid"], "");
		expect(issuesEmptyPath).toEqual([
			{ path: "[0]", rule: "type", message: "Expected number", received: "string" },
		]);
	});
});

describe("Object Validator", () => {
	test("rejects non-object, null, and array inputs", async () => {
		const validate = compileObjectValidator({});
		expect(await validate(null, "obj")).toHaveLength(1);
		expect(await validate([1, 2], "obj")).toHaveLength(1);
		expect(await validate("string", "obj")).toHaveLength(1);
	});

	test("validates required properties", async () => {
		const validate = compileObjectValidator({
			required: ["id", "email"],
		});
		const issues = await validate({ id: 1 }, "payload");
		expect(issues).toEqual([
			{ path: "payload.email", rule: "required", message: "Missing required property: email" },
		]);

		const rootIssues = await validate({}, "");
		expect(rootIssues).toHaveLength(2);
		expect(rootIssues[0].path).toBe("id");
	});

	test("recursively validates defined properties and skips dangerous keys", async () => {
		const validate = compileObjectValidator({
			properties: {
				name: { type: "string", minLength: 2 },
				__proto__: { type: "string" },
				constructor: { type: "string" },
			},
		});

		const issues = await validate({ name: "A" }, "data");
		expect(issues).toEqual([
			{ path: "data.name", rule: "minLength", message: "Must be at least 2 characters", expected: 2 },
		]);
	});
});

describe("File Validator", () => {
	test("returns issue when schema is not a valid validator object", async () => {
		const validate = compileFileValidator({} as ISchemaBase);
		const issues = await validate({}, "avatar");
		expect(issues).toEqual([
			{ path: "avatar", rule: "validation", message: "Invalid file validation schema", received: {} },
		]);
	});

	test("passes when safeParse succeeds", async () => {
		const mockSchema: SchemaValidatorObject = {
			safeParse: vi.fn().mockResolvedValue({ success: true, data: {} }),
		};
		const validate = compileFileValidator(mockSchema as unknown as ISchemaBase);
		expect(await validate({}, "avatar")).toEqual([]);
	});

	test("handles structured schemaIssues and fallbacks when safeParse fails", async () => {
		const mockSchema: SchemaValidatorObject = {
			safeParse: vi.fn().mockResolvedValue({
				success: false,
				issues: [
					{ path: ["sub", "ext"], message: "Invalid extension", rule: "file_type" },
					{ path: "size", message: "Too large" },
					{ path: 1, message: "Index error" },
				],
			}),
		};
		const validate = compileFileValidator(mockSchema as unknown as ISchemaBase);
		const issues = await validate({}, "doc");
		expect(issues).toEqual([
			{ path: "doc.sub.ext", rule: "file_type", message: "Invalid extension", received: undefined, expected: undefined },
			{ path: "doc.size", rule: "validation", message: "Too large", received: undefined, expected: undefined },
			{ path: "doc.1", rule: "validation", message: "Index error", received: undefined, expected: undefined },
		]);

		// Fallback when error.issues is a non-array object (triggers !Array.isArray(schemaIssues))
		const nonArrayMock: SchemaValidatorObject = {
			safeParse: vi.fn().mockResolvedValue({
				success: false,
				error: {
					message: "Root error",
					issues: {} as unknown as ValidationIssue[],
				},
			}),
		};
		const validateNonArray = compileFileValidator(nonArrayMock as unknown as ISchemaBase);
		expect(await validateNonArray("payload", "doc")).toEqual([
			{ path: "doc", rule: "validation", message: "Root error", received: "payload" },
		]);

		// Fallback when message is undefined in non-array error
		const defaultMsgMock: SchemaValidatorObject = {
			safeParse: vi.fn().mockResolvedValue({
				success: false,
				error: {
					issues: {} as unknown as ValidationIssue[],
				},
			}),
		};
		const validateDefaultMsg = compileFileValidator(defaultMsgMock as unknown as ISchemaBase);
		expect(await validateDefaultMsg("payload", "doc")).toEqual([
			{ path: "doc", rule: "validation", message: "File validation failed", received: "payload" },
		]);
	});
});

describe("SchemaValidator Orchestrator", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	test("returns empty issues for non-object schemas", async () => {
		const validate = SchemaValidator.compile(null);
		expect(await validate("any", "path")).toEqual([]);
	});

	test("dispatches compilation for all types and unhandled fallbacks", async () => {
		expect(await SchemaValidator.compile({ type: "string" })("str", "p")).toHaveLength(0);
		expect(await SchemaValidator.compile({ type: "number" })(10, "p")).toHaveLength(0);
		expect(await SchemaValidator.compile({ type: "boolean" })(true, "p")).toHaveLength(0);
		expect(await SchemaValidator.compile({ type: "array" })([], "p")).toHaveLength(0);
		expect(await SchemaValidator.compile({ type: "object" })({}, "p")).toHaveLength(0);
		expect(await SchemaValidator.compile({ type: "unknown" })("anything", "p")).toHaveLength(0);
	});

	test("handles nullability rules", async () => {
		const notNullable = SchemaValidator.compile({ type: "string", nullable: false });
		expect(await notNullable(null, "p")).toEqual([
			{ path: "p", rule: "nullable", message: "Value cannot be null or undefined" },
		]);

		const nullable = SchemaValidator.compile({ type: "string", nullable: true });
		expect(await nullable(null, "p")).toEqual([]);
		expect(await nullable(undefined, "p")).toEqual([]);
	});

	test("registers and applies global custom rules", async () => {
		SchemaValidator.registerRule("isEven", async (val: unknown) => {
			return typeof val === "number" && val % 2 === 0 ? null : "Must be even";
		});

		const validate = SchemaValidator.compile({
			type: "number",
			custom: "isEven",
		});

		expect(await validate(4, "num")).toEqual([]);
		expect(await validate(5, "num")).toEqual([
			{ path: "num", rule: "custom", message: "Must be even" },
		]);
	});

	test("warns when requested custom rule is not registered", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		SchemaValidator.compile({
			type: "string",
			custom: "unregisteredRule",
		});
		expect(warnSpy).toHaveBeenCalledWith(
			'[Subatom Validator] Custom rule "unregisteredRule" was requested but not registered.',
		);
	});
});