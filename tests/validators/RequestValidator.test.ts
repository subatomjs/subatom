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

vi.mock("../../openapi/openApiGenerator.js", () => ({
  isSingleFileRule: (rule: unknown) =>
    Boolean(
      rule &&
      typeof rule === "object" &&
      (rule as Record<string, unknown>)._isSingleFile,
    ),
  isMultipleFilesRule: (rule: unknown) =>
    Boolean(
      rule &&
      typeof rule === "object" &&
      (rule as Record<string, unknown>)._isMultipleFiles,
    ),
}));

const createMockReq = (
  overrides: Partial<Record<string, unknown>> = {},
): IRequest => {
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
    expect(coerceValue("123", "integer")).toBe(123);
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
      const err = (next as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as ErrorValidator;
      expect(err.details).toEqual([
        {
          path: "body",
          rule: "parse_error",
          message: "Failed to parse request body: Malformed syntax",
        },
      ]);
    });

    test("handles chunked transfer-encoding", async () => {
      const req = createMockReq({
        headers: {
          "content-type": "application/json",
          "transfer-encoding": "chunked",
        },
        json: vi.fn().mockResolvedValue({ chunked: true }),
      });
      const mw = buildRequestValidator({
        body: { safeParse: (data: unknown) => ({ success: true, data }) },
      });
      const next = vi.fn() as NextFunction;

      await mw(req, res, next);
      expect(req.body).toEqual({ chunked: true });
      expect(next).toHaveBeenCalledWith();
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
              issues: [
                { path: ["id"], rule: "invalid", message: "Must be 123" },
              ],
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

    test("handles direct safeParse returning error.details or default error message", async () => {
      const schemaWithDetails = {
        body: {
          safeParse: () => ({
            success: false,
            error: { details: [{ path: "email", message: "Invalid email" }] },
          }),
        },
      };
      const mwDetails = buildRequestValidator(schemaWithDetails);
      const req1 = createMockReq({ body: {} });
      const next1 = vi.fn();
      await mwDetails(req1, res, next1);
      expect(next1).toHaveBeenCalledWith(expect.any(ErrorValidator));

      const schemaWithEmptyError = {
        body: {
          safeParse: () => ({
            success: false,
            error: { message: "Root error message" },
          }),
        },
      };
      const mwEmpty = buildRequestValidator(schemaWithEmptyError);
      const req2 = createMockReq({ body: {} });
      const next2 = vi.fn();
      await mwEmpty(req2, res, next2);
      expect(next2).toHaveBeenCalledWith(expect.any(ErrorValidator));
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

    test("validates root array schema and resolves unwrapped elements", async () => {
      const elementValidator = {
        safeParse: (item: unknown) => {
          if (typeof item === "number")
            return { success: true, data: item * 2 };
          return {
            success: false,
            issues: [{ path: "", message: "Must be number" }],
          };
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

      // Empty schema element
      const mwEmptyElem = buildRequestValidator({ body: [] });
      const reqEmpty = createMockReq({ body: [1, 2] });
      const nextEmpty = vi.fn();
      await mwEmptyElem(reqEmpty, res, nextEmpty);
      expect(nextEmpty).toHaveBeenCalledWith();
    });

    test("covers various isRuleOptional shapes and path formatting utilities", async () => {
      const schema = {
        body: {
          opt1: { optional: true, type: "string" },
          opt2: { _optional: true, type: "string" },
          opt3: { _def: { isOptional: true }, type: "string" },
          opt4: { _def: { optional: true }, type: "string" },
          opt5: { _def: { typeName: "ZodOptional" }, type: "string" },
          opt6: { _def: { typeName: "ZodNullable" }, type: "string" },
          opt7: { _def: { typeName: "ZodDefault" }, type: "string" },
          opt8: { _def: { type: "optional" }, type: "string" },
        },
      };

      const mw = buildRequestValidator(schema);
      const req = createMockReq({
        body: {
          opt1: "",
          opt2: null,
          opt3: undefined,
          opt4: "%7Bid%7D",
          opt5: ":param",
          opt6: "{id}",
          opt7: "%7Btest%7D",
          opt8: "{value}",
        },
      });
      const next = vi.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body).toEqual({});
    });

    test("covers inspectRuleExpectedType innerType unwrapping and indicator matching", async () => {
      const schema = {
        body: {
          numField: { _def: { innerType: { typeName: "float" } } },
          intField: { innerType: { type: "integer" } },
          doubleField: { _def: { schema: { type: "double" } } },
          boolField: { schema: { typeName: "boolean" } },
          arrField: { _def: { type: { typeName: "array" } } },
          objField: { type: "object" },
        },
      };

      const mw = buildRequestValidator(schema);
      const req = createMockReq({
        body: {
          numField: "1.23",
          intField: "10",
          doubleField: "9.99",
          boolField: "true",
          arrField: ["1", "2"],
          objField: {},
        },
      });
      const next = vi.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      const b = req.body as Record<string, unknown>;
      expect(b.numField).toBe(1.23);
      expect(b.intField).toBe(10);
      expect(b.doubleField).toBe(9.99);
      expect(b.boolField).toBe(true);
    });

    test("handles root optional schema passing undefined/null", async () => {
      const optionalRootSchema = {
        isOptional: true,
        safeParse: () => ({ success: true }),
      };
      const mw = buildRequestValidator({ query: optionalRootSchema });
      const req = createMockReq({ query: undefined });
      const next = vi.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    test("handles dictionary validator rejecting non-object data", async () => {
      const mw = buildRequestValidator({
        body: {
          name: { type: "string" },
        },
      });

      const reqArr = createMockReq({ body: "string-payload" });
      const nextArr = vi.fn();
      await mw(reqArr, res, nextArr);
      expect(nextArr).toHaveBeenCalledWith(expect.any(ErrorValidator));

      const reqList = createMockReq({ body: [1, 2] });
      const nextList = vi.fn();
      await mw(reqList, res, nextList);
      expect(nextList).toHaveBeenCalledWith(expect.any(ErrorValidator));
    });

    test("handles dictionary rule without safeParse and shape function", async () => {
      const schemaWithShapeFn = {
        _def: {
          shape: () => ({
            age: { type: "number" },
          }),
        },
      };
      const mw = buildRequestValidator({ body: schemaWithShapeFn });
      const req = createMockReq({ body: { age: "25" } });
      const next = vi.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect((req.body as Record<string, unknown>).age).toBe(25);
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

      const reqOptional = createMockReq({
        body: { optionalId: "{id}", name: "Subatom" },
      });
      const next = vi.fn();
      await mw(reqOptional, res, next);
      expect(
        (reqOptional.body as { optionalId?: unknown }).optionalId,
      ).toBeUndefined();
      expect(next).toHaveBeenCalledWith();

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
      expect(
        (req.files as unknown as Record<string, FileUpload[]> | undefined)
          ?.docs,
      ).toEqual([mockFile]);
      expect(next).toHaveBeenCalledWith();
    });

    test("auto-assigns req.file from validatedFiles when req.file is empty", async () => {
      const mockFile = new FileUpload({
        filename: "report.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        storageType: "memory",
        buffer: Buffer.from("pdf content"),
      });

      const filesRule = {
        report: {
          _isSingleFile: true,
          safeParse: (val: unknown) => ({ success: true, data: val }),
        },
      };

      const mw = buildRequestValidator({ files: filesRule });
      const req = createMockReq({
        file: undefined,
        files: { report: mockFile },
      });
      const next = vi.fn();

      await mw(req, res, next);
      expect(req.file).toBe(mockFile);
      expect(next).toHaveBeenCalledWith();
    });

    test("handles root safeParse file rule with single file in array", async () => {
      const mockFile = new FileUpload({
        filename: "test.txt",
        encoding: "7bit",
        mimetype: "text/plain",
        storageType: "memory",
        buffer: Buffer.from("test"),
      });

      const fileRule = {
        _isSingleFile: true,
        safeParse: vi
          .fn()
          .mockImplementation((val) => ({ success: true, data: val })),
      };

      const mw = buildRequestValidator({ file: fileRule });
      const req = createMockReq({ file: [mockFile] });
      const next = vi.fn();

      await mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(fileRule.safeParse).toHaveBeenCalledWith(mockFile);
    });

    test("handles files array when rule dictionary has multiple keys", async () => {
      const filesRule = {
        doc1: { safeParse: (v: unknown) => ({ success: true, data: v }) },
        doc2: { safeParse: (v: unknown) => ({ success: true, data: v }) },
      };

      const mw = buildRequestValidator({ files: filesRule });
      const req = createMockReq({ files: [] });
      const next = vi.fn();

      await mw(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
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

  describe("Issue Path Formatting edge cases", () => {
    test("formats path when subPath is number or contains object key", async () => {
      const schema = {
        body: {
          safeParse: () => ({
            success: false,
            issues: [
              { path: [{ key: "fieldA" }, null, "child"], message: "Error A" },
              { path: 0, message: "Error 0" },
            ],
          }),
        },
      };

      const mw = buildRequestValidator(schema);
      const req = createMockReq({ body: {} });
      const next = vi.fn();

      await mw(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
      const err = (next as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as ErrorValidator;
      expect(err.details).toEqual([
        {
          path: "fieldA.child",
          rule: "invalid_type",
          message: "Error A",
          received: undefined,
          expected: undefined,
        },
        {
          path: "0",
          rule: "invalid_type",
          message: "Error 0",
          received: undefined,
          expected: undefined,
        },
      ]);
    });
  });

  describe("RequestValidator Edge Cases & Uncovered Branches", () => {
    test("covers primitive rule checks in isRuleOptional", async () => {
      const mw = buildRequestValidator({
        query: {
          validRule: "not-an-object",
        } as unknown as Record<string, unknown>,
      });

      const req = createMockReq({ query: { validRule: "test" } });
      const next = vi.fn();
      await mw(req, {} as IResponse, next);
      expect(next).toHaveBeenCalledWith();
    });

test("auto-coerces array items recursively when root target is an array", async () => {
		const mw = buildRequestValidator({
			body: [
				{
					safeParse: (val: unknown) => ({ success: true, data: val }),
				},
			],
		});

		const req = createMockReq({
			body: ["100", "true", "raw"],
		});
		const next = vi.fn();
		await mw(req, {} as IResponse, next);
		expect(next).toHaveBeenCalledWith();
		expect(req.body).toEqual([100, true, "raw"]);
	});

	test("handles validator safeParse failure and formats validation issues", async () => {
		const brokenValidator = {
			safeParse: () => ({
				success: false,
			}),
		};

		const mw = buildRequestValidator({
			headers: brokenValidator,
		});

		const req = createMockReq({ headers: { host: "localhost" } });
		const next = vi.fn();

		await mw(req, {} as IResponse, next);
		expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
		const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ErrorValidator;
		expect(err.details).toEqual([
			{
				path: "",
				rule: "validation",
				message: "Validation failed",
			},
		]);
	});

    test("handles array validation when an issue has an empty path", async () => {
      const elementValidator = {
        safeParse: () => ({
          success: false,
          issues: [{ rule: "custom_err", message: "Error without path" }],
        }),
      };

      const mw = buildRequestValidator({ body: [elementValidator] });
      const req = createMockReq({ body: ["element1"] });
      const next = vi.fn();

      await mw(req, {} as IResponse, next);
      expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
      const err = (next as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as ErrorValidator;
      expect(err.details).toEqual([
        {
          path: "0",
          rule: "custom_err",
          message: "Error without path",
          received: undefined,
          expected: undefined,
        },
      ]);
    });

    test("handles safeParse returning false with completely empty error object", async () => {
      const brokenValidator = {
        safeParse: () => ({
          success: false,
        }),
      };

      const mw = buildRequestValidator({
        body: brokenValidator,
      });

      const req = createMockReq({ body: "test" });
      const next = vi.fn();

      await mw(req, {} as IResponse, next);
      expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
      const err = (next as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as ErrorValidator;
      expect(err.details).toEqual([
        {
          path: "",
          rule: "validation",
          message: "Validation failed",
        },
      ]);
    });

test("handles validator safeParse failure and formats validation issues", async () => {
		const brokenValidator = {
			safeParse: () => ({
				success: false,
			}),
		};

		const mw = buildRequestValidator({
			headers: brokenValidator,
		});

		const req = createMockReq({ headers: { host: "localhost" } });
		const next = vi.fn();

		await mw(req, {} as IResponse, next);
		expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
		const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ErrorValidator;
		expect(err.details).toEqual([
			{
				path: "",
				rule: "validation",
				message: "Validation failed",
			},
		]);
	});

	test("handles array validation when an issue has an empty path", async () => {
		const elementValidator = {
			safeParse: () => ({
				success: false,
				issues: [{ rule: "custom_err", message: "Error without path" }],
			}),
		};

		const mw = buildRequestValidator({ body: [elementValidator] });
		const req = createMockReq({ body: ["element1"] });
		const next = vi.fn();

		await mw(req, {} as IResponse, next);
		expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
		const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ErrorValidator;
		expect(err.details).toEqual([
			{
				path: "0",
				rule: "custom_err",
				message: "Error without path",
				received: undefined,
				expected: undefined,
			},
		]);
	});

	test("handles safeParse returning false with completely empty error object", async () => {
		const brokenValidator = {
			safeParse: () => ({
				success: false,
			}),
		};

		const mw = buildRequestValidator({
			body: brokenValidator,
		});

		const req = createMockReq({ body: "test" });
		const next = vi.fn();

		await mw(req, {} as IResponse, next);
		expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
		const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ErrorValidator;
		expect(err.details).toEqual([
			{
				path: "",
				rule: "validation",
				message: "Validation failed",
			},
		]);
	});
  });
});


describe("RequestValidator - Lines 138, 214, 499, 561", () => {
	test("covers line 138: autoCoerceTarget recurses into array with child object containing string", async () => {
		const mw = buildRequestValidator({
			body: [
				{
					shape: {
						count: { type: "number" },
					},
					safeParse: (val: unknown) => ({ success: true, data: val }),
				},
			],
		});

		const req = createMockReq({
			body: [{ count: "42" }],
		});
		const next = vi.fn();
		await mw(req, {} as IResponse, next);
		expect(next).toHaveBeenCalledWith();
		expect(req.body).toEqual([{ count: 42 }]);
	});

	test("covers line 214: root array issue path formatting when element issue has empty path", async () => {
		const elementValidator = {
			safeParse: () => ({
				success: false,
				issues: [
					{
						path: "",
						rule: "custom_item_error",
						message: "Item error",
					},
				],
			}),
		};

		const mw = buildRequestValidator({ body: [elementValidator] });
		const req = createMockReq({ body: ["sample"] });
		const next = vi.fn();
		await mw(req, {} as IResponse, next);
		expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
		const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ErrorValidator;
		expect(err.details).toEqual([
			{
				path: "0",
				rule: "custom_item_error",
				message: "Item error",
				received: undefined,
				expected: undefined,
			},
		]);
	});

	test("covers line 499: plain dictionary field issue with falsy rule falling back to invalid_type", async () => {
		const mw = buildRequestValidator({
			body: {
				profile: {
					safeParse: () => ({
						success: false,
						issues: [
							{
								path: "bio",
								rule: "",
								message: "Bio required",
							},
						],
					}),
				},
			},
		});

		const req = createMockReq({ body: { profile: "invalid" } });
		const next = vi.fn();
		await mw(req, {} as IResponse, next);
		expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
		const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ErrorValidator;
		expect(err.details).toEqual([
			{
				path: "profile.bio",
				rule: "invalid_type",
				message: "Bio required",
				received: "string",
				expected: undefined,
			},
		]);
	});

	test("covers line 561: processValidator defaultPath fallback when validator fails without issues array", async () => {
		let interceptNextIsArray = false;
		const originalIsArray = Array.isArray;

		const isArraySpy = vi.spyOn(Array, "isArray").mockImplementation((arg) => {
			if (interceptNextIsArray) {
				interceptNextIsArray = false;
				return false;
			}
			return originalIsArray(arg);
		});

		try {
			const brokenValidator = {
				safeParse: () => {
					interceptNextIsArray = true;
					return { success: false };
				},
			};

			const mw = buildRequestValidator({
				headers: brokenValidator,
			});

			const req = createMockReq({ headers: { token: "abc" } });
			const next = vi.fn();
			await mw(req, {} as IResponse, next);

			expect(next).toHaveBeenCalledWith(expect.any(ErrorValidator));
			const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as ErrorValidator;
			expect(err.details).toEqual([
				{
					path: "headers",
					rule: "validation",
					message: "Invalid headers",
				},
			]);
		} finally {
			isArraySpy.mockRestore();
		}
	});
});
