import { describe, test, expect } from "vitest";
import * as ErrorExports from "../../../packages/errors/index.js";

describe("Error index.ts barrel export integrity", () => {
	test("exports all required error classes and handlers", () => {
		expect(ErrorExports.ErrorFormatter).toBeDefined();
		expect(ErrorExports.SubatomError).toBeDefined();
		expect(ErrorExports.NotFoundError).toBeDefined();
		expect(ErrorExports.BadRequestError).toBeDefined();
		expect(ErrorExports.MethodNotAllowedError).toBeDefined();
		expect(ErrorExports.PayloadTooLargeError).toBeDefined();
		expect(ErrorExports.UnprocessableEntityError).toBeDefined();
		expect(ErrorExports.FileFilterError).toBeDefined();
		expect(ErrorExports.normalizeError).toBeDefined();
		expect(ErrorExports.fileUploadErrorHandler).toBeDefined();
		expect(ErrorExports.InterceptorError).toBeDefined();
		expect(ErrorExports.SerializerError).toBeDefined();
		expect(ErrorExports.TransformerError).toBeDefined();
	});
});