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
} from "../../../package/core/http/errors/Error.js";

describe("Subatom Framework Error Hierarchy & Normalizer", () => {
	describe("SubatomError (Base Class)", () => {
		it("should initialize with default values when no options are provided", () => {
			const error = new SubatomError("Default failure");

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(SubatomError);
			expect(error.name).toBe("SubatomError");
			expect(error.message).toBe("Default failure");
			expect(error.statusCode).toBe(500);
			expect(error.errorCode).toBe("INTERNAL_SERVER_ERROR");
			expect(error.details).toBeUndefined();
			expect(error.isOperational).toBe(true);
			expect(error.stack).toBeDefined();
		});

		it("should initialize with explicit custom options", () => {
			const customDetails = { field: "username", reason: "duplicate" };
			const error = new SubatomError("Custom failure", {
				statusCode: 503,
				errorCode: "SERVICE_UNAVAILABLE",
				details: customDetails,
				isOperational: false,
			});

			expect(error.name).toBe("SubatomError");
			expect(error.message).toBe("Custom failure");
			expect(error.statusCode).toBe(503);
			expect(error.errorCode).toBe("SERVICE_UNAVAILABLE");
			expect(error.details).toEqual(customDetails);
			expect(error.isOperational).toBe(false);
		});

		it("should fall back to defaults when options contain falsy/empty values", () => {
			const error = new SubatomError("Fallback test", {
				statusCode: 0,
				errorCode: "",
			});

			expect(error.statusCode).toBe(500);
			expect(error.errorCode).toBe("INTERNAL_SERVER_ERROR");
			expect(error.isOperational).toBe(true);
		});
	});

	describe("NotFoundError", () => {
		it("should initialize with default message and metadata", () => {
			const error = new NotFoundError();

			expect(error).toBeInstanceOf(SubatomError);
			expect(error).toBeInstanceOf(NotFoundError);
			expect(error.name).toBe("NotFoundError");
			expect(error.message).toBe("Resource Not Found");
			expect(error.statusCode).toBe(404);
			expect(error.errorCode).toBe("NOT_FOUND");
			expect(error.isOperational).toBe(true);
		});

		it("should accept a custom message", () => {
			const error = new NotFoundError("User not found");

			expect(error.message).toBe("User not found");
			expect(error.statusCode).toBe(404);
			expect(error.errorCode).toBe("NOT_FOUND");
		});
	});

	describe("BadRequestError", () => {
		it("should initialize with default message and metadata", () => {
			const error = new BadRequestError();

			expect(error).toBeInstanceOf(SubatomError);
			expect(error).toBeInstanceOf(BadRequestError);
			expect(error.name).toBe("BadRequestError");
			expect(error.message).toBe("Bad Request");
			expect(error.statusCode).toBe(400);
			expect(error.errorCode).toBe("BAD_REQUEST");
			expect(error.details).toBeUndefined();
			expect(error.isOperational).toBe(true);
		});

		it("should accept custom message and structured details", () => {
			const validationErrors = [{ param: "email", msg: "Invalid format" }];
			const error = new BadRequestError("Validation failed", validationErrors);

			expect(error.message).toBe("Validation failed");
			expect(error.statusCode).toBe(400);
			expect(error.errorCode).toBe("BAD_REQUEST");
			expect(error.details).toEqual(validationErrors);
		});
	});

	describe("MethodNotAllowedError", () => {
		it("should initialize with default message and metadata", () => {
			const error = new MethodNotAllowedError();

			expect(error).toBeInstanceOf(SubatomError);
			expect(error).toBeInstanceOf(MethodNotAllowedError);
			expect(error.name).toBe("MethodNotAllowedError");
			expect(error.message).toBe("Method Not Allowed");
			expect(error.statusCode).toBe(405);
			expect(error.errorCode).toBe("METHOD_NOT_ALLOWED");
			expect(error.isOperational).toBe(true);
		});

		it("should accept a custom message", () => {
			const error = new MethodNotAllowedError("POST not allowed on this route");

			expect(error.message).toBe("POST not allowed on this route");
			expect(error.statusCode).toBe(405);
			expect(error.errorCode).toBe("METHOD_NOT_ALLOWED");
		});
	});

	describe("PayloadTooLargeError", () => {
		it("should initialize with default message and metadata", () => {
			const error = new PayloadTooLargeError();

			expect(error).toBeInstanceOf(SubatomError);
			expect(error).toBeInstanceOf(PayloadTooLargeError);
			expect(error.name).toBe("PayloadTooLargeError");
			expect(error.message).toBe("Payload Too Large");
			expect(error.statusCode).toBe(413);
			expect(error.errorCode).toBe("PAYLOAD_TOO_LARGE");
			expect(error.isOperational).toBe(true);
		});

		it("should accept a custom message", () => {
			const error = new PayloadTooLargeError(
				"Max upload limit of 10MB exceeded",
			);

			expect(error.message).toBe("Max upload limit of 10MB exceeded");
			expect(error.statusCode).toBe(413);
			expect(error.errorCode).toBe("PAYLOAD_TOO_LARGE");
		});
	});

	describe("UnprocessableEntityError", () => {
		it("should initialize with default message and metadata", () => {
			const error = new UnprocessableEntityError();

			expect(error).toBeInstanceOf(SubatomError);
			expect(error).toBeInstanceOf(UnprocessableEntityError);
			expect(error.name).toBe("UnprocessableEntityError");
			expect(error.message).toBe("Unprocessable Entity");
			expect(error.statusCode).toBe(422);
			expect(error.errorCode).toBe("UNPROCESSABLE_ENTITY");
			expect(error.details).toBeUndefined();
			expect(error.isOperational).toBe(true);
		});

		it("should accept custom message and details", () => {
			const semanticDetails = { line: 12, reason: "Semantic syntax error" };
			const error = new UnprocessableEntityError(
				"Semantic failure",
				semanticDetails,
			);

			expect(error.message).toBe("Semantic failure");
			expect(error.statusCode).toBe(422);
			expect(error.errorCode).toBe("UNPROCESSABLE_ENTITY");
			expect(error.details).toEqual(semanticDetails);
		});
	});

	describe("FileFilterError", () => {
		it("should initialize with default message and correct name overriding", () => {
			const error = new FileFilterError();

			expect(error).toBeInstanceOf(SubatomError);
			expect(error).toBeInstanceOf(UnprocessableEntityError);
			expect(error).toBeInstanceOf(FileFilterError);
			expect(error.name).toBe("FileFilterError");
			expect(error.message).toBe("File type not allowed");
			expect(error.statusCode).toBe(422);
			expect(error.errorCode).toBe("UNPROCESSABLE_ENTITY");
			expect(error.isOperational).toBe(true);
		});

		it("should accept a custom message", () => {
			const error = new FileFilterError("Only .png files are accepted");

			expect(error.name).toBe("FileFilterError");
			expect(error.message).toBe("Only .png files are accepted");
			expect(error.statusCode).toBe(422);
		});
	});

	describe("normalizeError()", () => {
		it("should return native Error instances unchanged", () => {
			const nativeError = new TypeError("Invalid argument");
			const result = normalizeError(nativeError);

			expect(result).toBe(nativeError);
			expect(result).toBeInstanceOf(TypeError);
			expect(result.message).toBe("Invalid argument");
		});

		it("should return SubatomError instances unchanged", () => {
			const customError = new NotFoundError("Entity missing");
			const result = normalizeError(customError);

			expect(result).toBe(customError);
			expect(result).toBeInstanceOf(NotFoundError);
			expect((result as NotFoundError).statusCode).toBe(404);
		});

		it("should wrap primitive strings in a SubatomError", () => {
			const result = normalizeError("Database connection lost");

			expect(result).toBeInstanceOf(SubatomError);
			expect(result.message).toBe("Database connection lost");
			expect((result as SubatomError).statusCode).toBe(500);
			expect((result as SubatomError).errorCode).toBe("INTERNAL_SERVER_ERROR");
			expect((result as SubatomError).details).toBeUndefined();
			expect((result as SubatomError).isOperational).toBe(true);
		});

		it("should wrap plain objects in a SubatomError with details preserved", () => {
			const payload = { status: "failed", reason: "timeout", attempt: 3 };
			const result = normalizeError(payload);

			expect(result).toBeInstanceOf(SubatomError);
			expect(result.message).toBe(
				"A non-Error value was thrown during request handling.",
			);
			expect((result as SubatomError).statusCode).toBe(500);
			expect((result as SubatomError).errorCode).toBe("INTERNAL_SERVER_ERROR");
			expect((result as SubatomError).details).toEqual(payload);
		});

		it("should handle null and undefined safely", () => {
			const nullResult = normalizeError(null);
			expect(nullResult).toBeInstanceOf(SubatomError);
			expect((nullResult as SubatomError).details).toBeNull();

			const undefinedResult = normalizeError(undefined);
			expect(undefinedResult).toBeInstanceOf(SubatomError);
			expect((undefinedResult as SubatomError).details).toBeUndefined();
		});

		it("should handle primitive numbers and booleans safely", () => {
			const numberResult = normalizeError(500);
			expect(numberResult).toBeInstanceOf(SubatomError);
			expect((numberResult as SubatomError).details).toBe(500);

			const boolResult = normalizeError(false);
			expect(boolResult).toBeInstanceOf(SubatomError);
			expect((boolResult as SubatomError).details).toBe(false);
		});
	});
});
