// tests/errors/Error.test.ts
import { describe, expect, it } from "vitest";
import {
	BadRequestError,
	FileFilterError,
	MethodNotAllowedError,
	NotFoundError,
	normalizeError,
	PayloadTooLargeError,
	SubatomError,
	UnprocessableEntityError,
} from "../../../../package/core/http/errors/Error.js";

describe("Subatom Framework Error Classes", () => {
	it("should instantiate base SubatomError with default and custom properties", () => {
		const defaultErr = new SubatomError("Internal failure");
		expect(defaultErr.name).toBe("SubatomError");
		expect(defaultErr.message).toBe("Internal failure");
		expect(defaultErr.statusCode).toBe(500);
		expect(defaultErr.errorCode).toBe("INTERNAL_SERVER_ERROR");
		expect(defaultErr.isOperational).toBe(true);
		expect(defaultErr.details).toBeUndefined();

		const customErr = new SubatomError("Custom failure", {
			statusCode: 503,
			errorCode: "SERVICE_UNAVAILABLE",
			details: { retryAfter: 120 },
			isOperational: false,
		});
		expect(customErr.statusCode).toBe(503);
		expect(customErr.errorCode).toBe("SERVICE_UNAVAILABLE");
		expect(customErr.details).toEqual({ retryAfter: 120 });
		expect(customErr.isOperational).toBe(false);
	});

	it("should instantiate NotFoundError with status 404", () => {
		const err = new NotFoundError("User missing");
		expect(err).toBeInstanceOf(SubatomError);
		expect(err.statusCode).toBe(404);
		expect(err.errorCode).toBe("NOT_FOUND");
		expect(err.message).toBe("User missing");
	});

	it("should instantiate BadRequestError with status 400 and custom details", () => {
		const err = new BadRequestError("Invalid payload", { field: "email" });
		expect(err).toBeInstanceOf(SubatomError);
		expect(err.statusCode).toBe(400);
		expect(err.errorCode).toBe("BAD_REQUEST");
		expect(err.details).toEqual({ field: "email" });
	});

	it("should instantiate MethodNotAllowedError with status 405", () => {
		const err = new MethodNotAllowedError();
		expect(err.statusCode).toBe(405);
		expect(err.errorCode).toBe("METHOD_NOT_ALLOWED");
		expect(err.message).toBe("Method Not Allowed");
	});

	it("should instantiate PayloadTooLargeError with status 413", () => {
		const err = new PayloadTooLargeError("File too big");
		expect(err.statusCode).toBe(413);
		expect(err.errorCode).toBe("PAYLOAD_TOO_LARGE");
	});

	it("should instantiate UnprocessableEntityError with status 422", () => {
		const err = new UnprocessableEntityError("Validation failed", {
			errorCount: 2,
		});
		expect(err.statusCode).toBe(422);
		expect(err.errorCode).toBe("UNPROCESSABLE_ENTITY");
		expect(err.details).toEqual({ errorCount: 2 });
	});

	it("should instantiate FileFilterError extending UnprocessableEntityError", () => {
		const err = new FileFilterError();
		expect(err).toBeInstanceOf(UnprocessableEntityError);
		expect(err.name).toBe("FileFilterError");
		expect(err.statusCode).toBe(422);
		expect(err.message).toBe("File type not allowed");
	});

	describe("normalizeError()", () => {
		it("should return the exact error if an Error instance is passed", () => {
			const original = new Error("Native error");
			expect(normalizeError(original)).toBe(original);
		});

		it("should wrap a raw string into a SubatomError", () => {
			const normalized = normalizeError("Unexpected string throw");
			expect(normalized).toBeInstanceOf(SubatomError);
			expect(normalized.message).toBe("Unexpected string throw");
		});

		it("should wrap non-error primitives and objects into a SubatomError with details", () => {
			const payload = { code: 99, reason: "corrupt" };
			const normalized = normalizeError(payload);
			expect(normalized).toBeInstanceOf(SubatomError);
			expect(normalized.message).toBe(
				"A non-Error value was thrown during request handling.",
			);
			expect((normalized as SubatomError).details).toEqual(payload);
		});
	});
});
