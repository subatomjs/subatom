/// <reference types="node" />
import { describe, test, expect, vi } from "vitest";
import {
	buildRequestValidator,
	coerceValue,
} from "../../packages/validations/RequestValidator.js";
import { ErrorValidator } from "../../packages/validations/ErrorValidator.js";
import { FileUpload } from "../../packages/pipelines/files/FileUpload.js";
import type { IRequest } from "../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../packages/core/http/response/types/response.types.js";
import type { NextFunction } from "../../packages/pipelines/next/types/nextFunction.types.js";

// Mock openApiGenerator with the correct relative path
vi.mock("../../openapi/openApiGenerator.js", () => ({
	isSingleFileRule: (rule: unknown) =>
		Boolean(rule && typeof rule === "object" && (rule as Record<string, unknown>)._isSingleFile),
	isMultipleFilesRule: (rule: unknown) =>
		Boolean(rule && typeof rule === "object" && (rule as Record<string, unknown>)._isMultipleFiles),
}));

const createMockReq = (overrides: Partial<Record<string, unknown>> = {}): IRequest => {
	return {
		headers: {},
		params: {},
		query: {},
		body: undefined,
		file: undefined,
		files: undefined,
		...overrides,
	} as unknown as IRequest;
};

describe("RequestValidator Coercion and Utilities", () => {
	test("coerces values based on explicit and inferred types", () => {
		expect(coerceValue("123", "number")).toBe(123);
		expect(coerceValue("abc", "number")).toBe("abc");
		expect(coerceValue("true", "boolean")).toBe(true);
		expect(coerceValue("1", "boolean")).toBe(true);
		expect(coerceValue("false", "boolean")).toBe(false);
		expect(coerceValue("0", "boolean")).toBe(false);

		// Fallback heuristics
		expect(coerceValue("true")).toBe(true);
		expect(coerceValue("false")).toBe(false);
		expect(coerceValue("42")).toBe(42);
		expect(coerceValue("unchanged")).toBe("unchanged");
		expect(coerceValue(100)).toBe(100);
	});
});

describe("RequestValidator Pipeline Execution", () => {
	const res = {} as IResponse;

	test("passes through when no schemas are provided", async () => {
		const mw = buildRequestValidator({});
		const req = createMockReq();
		const next = vi.fn() as NextFunction;

		await mw(req, res, next);
		expect(next).toHaveBeenCalledWith();
	});

	describe("Body Auto-Parsing", () => {
		test("parses json body when content-type is application/json", async () => {
			const req = createMockReq({
				headers: { "content-type": "application/json", "content-length": "15" },
				json: vi.fn().mockResolvedValue({ parsed: true }),
			});
			const mw = buildRequestValidator({
				body: { safeParse: (data: unknown) => ({ success: true, data }) },
			});
			const next = vi.fn() as NextFunction;

			await mw(req, res, next);
			expect(req.body).toEqual({ parsed: true });
			expect(next).toHaveBeenCalledWith();
		});

		test("parses urlencoded form data body", async () => {
			const formDataMap = new Map([["user", "john"]]);
			const req = createMockReq({
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"content-length": "9",
				},
				formData: vi.fn().mockResolvedValue(formDataMap),
			});
			const mw = buildRequestValidator({
				body: { safeParse: (data: unknown) => ({ success: true, data }) },
			});
			const next = vi.fn() as NextFunction;

			await mw(req, res, next);
			expect(req.body).toEqual({ user: "john" });
		});

		test("parses plain text body", async () => {
			const req = createMockReq({
				headers: { "content-length": "5" },
				text: vi.fn().mockResolvedValue("hello"),
			});
			const mw = buildRequestValidator({
				body: { safeParse: (data: unknown) => ({ success: true, data }) },
			});
			const next = vi.fn() as NextFunction;

			await mw(req, res, next);
			expect(req.body).toBe("hello");
		});

		test("catches body parsing exceptions and forwards ErrorValidator", async () => {
			const req = createMockReq({
				headers: { "content-type": "application/json", "content-length": "10" },
				json: vi.fn().mockRejectedValue(new Error("Malformed syntax")),
			});
			const mw = buildRequestValidator({
				body: { safeParse: (data: unknown) => ({ success: true, data }) },
			});
			const next = vi.fn() as NextFunction;

			await mw(req, res, next);
			expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
			const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ErrorValidator;
			expect(err.details).toEqual([
				{
					path: "body",
					rule: "parse_error",
					message: "Failed to parse request body: Malformed syntax",
				},
			]);
		});
	});

	describe("Schema Flavors & Validation Strategies", () => {
		test("validates with direct safeParse instance (Zod-like)", async () => {
			const schema = {
				params: {
					safeParse: (val: unknown) => {
						const rec = val as { id?: number };
						if (rec?.id === 123) return { success: true, data: { id: 123 } };
						return {
							success: false,
							issues: [{ path: ["id"], rule: "invalid", message: "Must be 123" }],
						};
					},
				},
			};

			const mw = buildRequestValidator(schema);
			const reqValid = createMockReq({ params: { id: "123" } });
			const nextValid = vi.fn();

			await mw(reqValid, res, nextValid);
			expect(reqValid.params).toEqual({ id: 123 });
			expect(nextValid).toHaveBeenCalledWith();

			const reqInvalid = createMockReq({ params: { id: "456" } });
			const nextInvalid = vi.fn();

			await mw(reqInvalid, res, nextInvalid);
			expect(nextInvalid).toHaveBeenCalledWith(expect.any(ErrorValidator));
		});

		test("validates with Standard Schema (~standard specification)", async () => {
			const standardValidator = {
				"~standard": {
					version: 1,
					vendor: "subatom",
					validate: (val: unknown) => {
						const str = String(val);
						if (str === "valid") return { value: "valid" };
						return {
							issues: [{ message: "Not valid", path: ["query"] }],
						};
					},
				},
			};

			const mw = buildRequestValidator({ query: standardValidator });
			const reqValid = createMockReq({ query: "valid" });
			const next = vi.fn();

			await mw(reqValid, res, next);
			expect(next).toHaveBeenCalledWith();

			const reqInvalid = createMockReq({ query: "bad" });
			const nextFail = vi.fn();

			await mw(reqInvalid, res, nextFail);
			expect(nextFail).toHaveBeenCalledWith(expect.any(ErrorValidator));
		});

		test("validates root array schema", async () => {
			const elementValidator = {
				safeParse: (item: unknown) => {
					if (typeof item === "number") return { success: true, data: item * 2 };
					return { success: false, issues: [{ path: "", message: "Must be number" }] };
				},
			};

			const mw = buildRequestValidator({ body: [elementValidator] });

			// Non-array rejection
			const reqNonArray = createMockReq({ body: "not-an-array" });
			const nextNonArray = vi.fn();
			await mw(reqNonArray, res, nextNonArray);
			expect(nextNonArray).toHaveBeenCalledWith(expect.any(ErrorValidator));

			// Success
			const reqSuccess = createMockReq({ body: [1, 2] });
			const nextSuccess = vi.fn();
			await mw(reqSuccess, res, nextSuccess);
			expect(reqSuccess.body).toEqual([2, 4]);

			// Element failure
			const reqFail = createMockReq({ body: ["bad"] });
			const nextFail = vi.fn();
			await mw(reqFail, res, nextFail);
			expect(nextFail).toHaveBeenCalledWith(expect.any(ErrorValidator));
		});

		test("validates plain dictionary rules object and sanitizes optional parameters", async () => {
			const dictSchema = {
				body: {
					optionalId: {
						isOptional: true,
						type: "number",
					},
					name: {
						type: "string",
						safeParse: (val: unknown) =>
							val === "Subatom"
								? { success: true, data: val }
								: { success: false, error: { message: "Invalid name" } },
					},
				},
			};

			const mw = buildRequestValidator(dictSchema);

			// Clean optional template path
			const reqOptional = createMockReq({
				body: { optionalId: "{id}", name: "Subatom" },
			});
			const next = vi.fn();
			await mw(reqOptional, res, next);
			expect((reqOptional.body as { optionalId?: unknown }).optionalId).toBeUndefined();
			expect(next).toHaveBeenCalledWith();

			// Field failure
			const reqFail = createMockReq({
				body: { name: "Wrong" },
			});
			const nextFail = vi.fn();
			await mw(reqFail, res, nextFail);
			expect(nextFail).toHaveBeenCalledWith(expect.any(ErrorValidator));
		});
	});

	describe("File and Files Validation Integration", () => {
		test("unwraps single file from array and handles files array mapping", async () => {
			const mockFile = new FileUpload({
				filename: "avatar.png",
				encoding: "7bit",
				mimetype: "image/png",
				storageType: "memory",
				buffer: Buffer.from("image content"),
			});

			const fileRule = {
				_isSingleFile: true,
				safeParse: (val: unknown) => ({ success: true, data: val }),
			};
			const filesRule = {
				avatar: {
					_isSingleFile: true,
					safeParse: (val: unknown) => ({ success: true, data: val }),
				},
			};

			const mw = buildRequestValidator({ file: fileRule, files: filesRule });
			const req = createMockReq({
				file: [mockFile],
				files: [mockFile],
			});
			const next = vi.fn();

			await mw(req, res, next);
			expect(req.file).toBe(mockFile);
			expect(next).toHaveBeenCalledWith();
		});

		test("wraps single file into array when multiple files are expected", async () => {
			const mockFile = new FileUpload({
				filename: "doc.pdf",
				encoding: "7bit",
				mimetype: "application/pdf",
				storageType: "memory",
				buffer: Buffer.from("pdf content"),
			});

			const filesRule = {
				docs: {
					_isMultipleFiles: true,
					safeParse: (val: unknown) => ({ success: true, data: val }),
				},
			};

			const mw = buildRequestValidator({ files: filesRule });
			const req = createMockReq({
				files: { docs: mockFile },
			});
			const next = vi.fn();

			await mw(req, res, next);
			expect((req.files as unknown as Record<string, FileUpload[]> | undefined)?.docs).toEqual([mockFile]);
			expect(next).toHaveBeenCalledWith();
		});
	});

	describe("Headers processing", () => {
		test("validates and coerces request headers", async () => {
			const mw = buildRequestValidator({
				headers: {
					"x-rate": {
						type: "number",
						safeParse: (val: unknown) => ({ success: true, data: val }),
					},
				},
			});
			const req = createMockReq({ headers: { "x-rate": "500" } });
			const next = vi.fn();

			await mw(req, res, next);
			expect(next).toHaveBeenCalledWith();
		});
	});
});