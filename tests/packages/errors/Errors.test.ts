import { describe, test, expect, beforeEach, it } from "vitest";

import {
	SubatomError,
	NotFoundError,
	BadRequestError,
	MethodNotAllowedError,
	PayloadTooLargeError,
	UnprocessableEntityError,
	FileFilterError,
	normalizeError,
} from "../../../packages/errors/Errors.js";
import {
	RateLimitError,
	RateLimitConfigError,
	RateLimitStoreError,
} from "../../../packages/errors/RateLimitError.js";
import {
	SubatomSecurityError,
	InvalidDirectiveError,
	InvalidConfigurationError,
} from "../../../packages/errors/SecurityErrors.js";
import { InterceptorError } from "../../../packages/errors/modifiers/InterceptorError.js";
import { SerializerError } from "../../../packages/errors/modifiers/SerializerError.js";
import { TransformerError } from "../../../packages/errors/modifiers/TransformerError.js";
import { SubatomError as HandlerSubatomError } from "../../../packages/errors/types/handler.error.types.js";

declare const process: {
	env: Record<string, string | undefined>;
};

describe("Subatom Framework Errors Hierarchy", () => {
	test.each([
		[NotFoundError, "Resource Not Found", 404],
		[BadRequestError, "Bad Request", 400],
		[MethodNotAllowedError, "Method Not Allowed", 405],
		[PayloadTooLargeError, "Payload Too Large", 413],
		[UnprocessableEntityError, "Unprocessable Entity", 422],
		[FileFilterError, "File type not allowed", 422],
	])(
		"constructs and throws %s with default and custom values",
		(ErrorClass, defaultMessage, statusCode) => {
			const defaultError = new ErrorClass();
			const customError = new ErrorClass("custom failure");

			expect(defaultError.message).toBe(defaultMessage);
			expect(defaultError.statusCode).toBe(statusCode);
			expect(defaultError.name).toBe(ErrorClass.name);
			expect(customError.message).toBe("custom failure");
			expect(customError.statusCode).toBe(statusCode);
			expect(customError.name).toBe(ErrorClass.name);

			try {
				throw customError;
			} catch (caught) {
				expect(caught).toBe(customError);
			}
		},
	);

	describe("SubatomError", () => {
		test("initializes with default options", () => {
			const err = new SubatomError("Default failure");
			expect(err.message).toBe("Default failure");
			expect(err.name).toBe("SubatomError");
			expect(err.statusCode).toBe(500);
			expect(err.errorCode).toBe("INTERNAL_SERVER_ERROR");
			expect(err.details).toBeUndefined();
			expect(err.isOperational).toBe(true);
			expect(err.stack).toBeDefined();
		});

		test("accepts custom parameters and overrides", () => {
			const details = { field: "username" };
			const err = new SubatomError("Custom failure", {
				statusCode: 418,
				errorCode: "TEAPOT",
				details,
				isOperational: false,
			});
			expect(err.statusCode).toBe(418);
			expect(err.errorCode).toBe("TEAPOT");
			expect(err.details).toBe(details);
			expect(err.isOperational).toBe(false);
		});
	});

	describe("Built-in Error Subclasses", () => {
		test("NotFoundError initializes with defaults and custom message", () => {
			const def = new NotFoundError();
			expect(def.message).toBe("Resource Not Found");
			expect(def.statusCode).toBe(404);
			expect(def.errorCode).toBe("NOT_FOUND");

			const custom = new NotFoundError("User missing");
			expect(custom.message).toBe("User missing");
			expect(custom.statusCode).toBe(404);
		});

		test("BadRequestError initializes with defaults and custom details", () => {
			const def = new BadRequestError();
			expect(def.message).toBe("Bad Request");
			expect(def.statusCode).toBe(400);
			expect(def.errorCode).toBe("BAD_REQUEST");
			expect(def.details).toBeUndefined();

			const err = new BadRequestError("Invalid payload", { key: "missing" });
			expect(err.message).toBe("Invalid payload");
			expect(err.details).toEqual({ key: "missing" });
		});

		test("MethodNotAllowedError initializes correctly", () => {
			const def = new MethodNotAllowedError();
			expect(def.message).toBe("Method Not Allowed");
			expect(def.statusCode).toBe(405);
			expect(def.errorCode).toBe("METHOD_NOT_ALLOWED");

			const custom = new MethodNotAllowedError("POST disallowed");
			expect(custom.message).toBe("POST disallowed");
		});

		test("PayloadTooLargeError initializes correctly", () => {
			const def = new PayloadTooLargeError();
			expect(def.message).toBe("Payload Too Large");
			expect(def.statusCode).toBe(413);
			expect(def.errorCode).toBe("PAYLOAD_TOO_LARGE");

			const custom = new PayloadTooLargeError("Max size 10MB");
			expect(custom.message).toBe("Max size 10MB");
		});

		test("UnprocessableEntityError initializes correctly", () => {
			const def = new UnprocessableEntityError();
			expect(def.message).toBe("Unprocessable Entity");
			expect(def.statusCode).toBe(422);
			expect(def.errorCode).toBe("UNPROCESSABLE_ENTITY");

			const custom = new UnprocessableEntityError("Validation failed", [
				"err1",
			]);
			expect(custom.details).toEqual(["err1"]);
		});

		test("FileFilterError overrides name property", () => {
			const def = new FileFilterError();
			expect(def.message).toBe("File type not allowed");
			expect(def.name).toBe("FileFilterError");
			expect(def.statusCode).toBe(422);

			const custom = new FileFilterError("Only PNGs allowed");
			expect(custom.message).toBe("Only PNGs allowed");
		});
	});

	describe("normalizeError", () => {
		test("returns standard Error instances unchanged", () => {
			const original = new Error("Native error");
			expect(normalizeError(original)).toBe(original);
		});

		test("wraps string inputs in SubatomError", () => {
			const result = normalizeError("Something blew up");
			expect(result).toBeInstanceOf(SubatomError);
			expect(result.message).toBe("Something blew up");
		});

		test("wraps non-error objects with details preserved", () => {
			const rawPayload = { status: "failed", reason: 404 };
			const result = normalizeError(rawPayload) as SubatomError;
			expect(result).toBeInstanceOf(SubatomError);
			expect(result.message).toBe(
				"A non-Error value was thrown during request handling.",
			);
			expect(result.details).toBe(rawPayload);
		});

		test("wraps primitives like null and undefined", () => {
			const resultNull = normalizeError(null) as SubatomError;
			expect(resultNull).toBeInstanceOf(SubatomError);
			expect(resultNull.details).toBeNull();

			const resultUndefined = normalizeError(undefined) as SubatomError;
			expect(resultUndefined.details).toBeUndefined();
		});
	});
});

describe("Pipeline Modifier Errors", () => {
	describe("InterceptorError", () => {
		test("formats message with named interceptor and Error cause", () => {
			const cause = new Error("Internal fail");
			const err = new InterceptorError("AuthInterceptor", cause);
			expect(err.name).toBe("InterceptorError");
			expect(err.interceptorName).toBe("AuthInterceptor");
			expect(err.cause).toBe(cause);
			expect(err.message).toBe(
				'[Subatom] Interceptor "AuthInterceptor" threw: Internal fail',
			);
		});

		test("formats message with undefined interceptor and non-error cause", () => {
			const err = new InterceptorError(undefined, "Timeout reached");
			expect(err.interceptorName).toBeUndefined();
			expect(err.cause).toBe("Timeout reached");
			expect(err.message).toBe(
				"[Subatom] Interceptor (anonymous) threw: Timeout reached",
			);
		});
	});

	describe("SerializerError", () => {
		test("formats message with named serializer and Error cause", () => {
			const cause = new Error("Invalid JSON");
			const err = new SerializerError("JsonSerializer", cause);
			expect(err.name).toBe("SerializerError");
			expect(err.serializerName).toBe("JsonSerializer");
			expect(err.cause).toBe(cause);
			expect(err.message).toBe(
				'[Subatom] Serializer "JsonSerializer" threw: Invalid JSON',
			);
		});

		test("formats message with undefined serializer and non-error cause", () => {
			const err = new SerializerError(undefined, 500);
			expect(err.serializerName).toBeUndefined();
			expect(err.message).toBe("[Subatom] Serializer (anonymous) threw: 500");
		});
	});

	describe("TransformerError", () => {
		test("formats message with named transformer, hook, and Error cause", () => {
			const cause = new Error("Parsing failure");
			const err = new TransformerError(
				"beforeTransform" as never,
				"CustomTransformer",
				cause,
			);
			expect(err.name).toBe("TransformerError");
			expect(err.hook).toBe("beforeTransform");
			expect(err.transformerName).toBe("CustomTransformer");
			expect(err.cause).toBe(cause);
			expect(err.message).toBe(
				'[Subatom] Transformer "CustomTransformer" threw during "beforeTransform": Parsing failure',
			);
		});

		test("formats message with undefined transformer and non-error cause", () => {
			const err = new TransformerError(
				"afterTransform" as never,
				undefined,
				"Broken stream",
			);
			expect(err.transformerName).toBeUndefined();
			expect(err.message).toBe(
				'[Subatom] Transformer (anonymous) threw during "afterTransform": Broken stream',
			);
		});
	});
});

describe("RateLimit & Security Errors", () => {
	test("RateLimit errors maintain hierarchy and formatting", () => {
		const base = new RateLimitError("Rate limit hit");
		expect(base.name).toBe("RateLimitError");
		expect(base.message).toBe("Rate limit hit");

		const configErr = new RateLimitConfigError("Invalid max options");
		expect(configErr).toBeInstanceOf(RateLimitError);
		expect(configErr.message).toBe(
			"[RateLimit Config Error]: Invalid max options",
		);

		const storeErr = new RateLimitStoreError("Redis connection dropped");
		expect(storeErr).toBeInstanceOf(RateLimitError);
		expect(storeErr.message).toBe(
			"[RateLimit Store Error]: Redis connection dropped",
		);
	});

	test("Security errors maintain hierarchy and formatting", () => {
		const base = new SubatomSecurityError("Access Denied");
		expect(base.name).toBe("SubatomSecurityError");
		expect(base.message).toBe("[Subatom Security]: Access Denied");

		const directiveErr = new InvalidDirectiveError("Invalid CSP directive");
		expect(directiveErr).toBeInstanceOf(SubatomSecurityError);
		expect(directiveErr.name).toBe("InvalidDirectiveError");
		expect(directiveErr.message).toBe(
			"[Subatom Security]: Invalid CSP directive",
		);

		const configErr = new InvalidConfigurationError("Missing CORS config");
		expect(configErr).toBeInstanceOf(SubatomSecurityError);
		expect(configErr.name).toBe("InvalidConfigurationError");
		expect(configErr.message).toBe("[Subatom Security]: Missing CORS config");
	});
});

describe("HandlerSubatomError (types/handler.error.types.ts)", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		process.env.NODE_ENV = "test";
	});

	test("assigns defaults when initialized with empty options", () => {
		const err = new HandlerSubatomError();
		expect(err.message).toBe("An internal server error occurred.");
		expect(err.statusCode).toBe(500);
		expect(err.status).toBe(500);
		expect(err.code).toBe("INTERNAL_SERVER_ERROR");
		expect(err.isOperational).toBe(false);
		expect(err.severity).toBe("error");
		expect(err.timestamp).toBeDefined();
	});

	test("validates HTTP status code boundaries", () => {
		const lowErr = new HandlerSubatomError({ statusCode: 99 });
		expect(lowErr.statusCode).toBe(500);

		const highErr = new HandlerSubatomError({ statusCode: 600 });
		expect(highErr.statusCode).toBe(500);

		const validClientErr = new HandlerSubatomError({ statusCode: 404 });
		expect(validClientErr.statusCode).toBe(404);
		expect(validClientErr.code).toBe("BAD_REQUEST");
		expect(validClientErr.isOperational).toBe(true);
		expect(validClientErr.severity).toBe("warn");
	});

	test("assigns custom fields when explicitly provided", () => {
		const details = { sample: true };
		const validationErrors = [
			{ path: "email", message: "Invalid email format" },
		];
		const headers = { "Retry-After": "120" };

		const err = new HandlerSubatomError({
			message: "Action forbidden",
			statusCode: 403,
			code: "CUSTOM_FORBIDDEN",
			isOperational: false,
			severity: "fatal",
			details,
			validationErrors,
			headers,
			requestId: "req-1",
			traceId: "trace-99",
		});

		expect(err.message).toBe("Action forbidden");
		expect(err.code).toBe("CUSTOM_FORBIDDEN");
		expect(err.isOperational).toBe(false);
		expect(err.severity).toBe("fatal");
		expect(err.details).toBe(details);
		expect(err.validationErrors).toBe(validationErrors);
		expect(err.headers).toBe(headers);
		expect(err.requestId).toBe("req-1");
		expect(err.traceId).toBe("trace-99");
	});

	test("serializes to JSON in non-production environment", () => {
		const err = new HandlerSubatomError({
			message: "Debuggable error",
			statusCode: 400,
			requestId: "req-debug",
			traceId: "trace-debug",
			validationErrors: [{ path: "id", message: "Must be number" }],
			details: { currentVal: "abc" },
		});

		const json = err.toJSON() as {
			success: boolean;
			error: Record<string, unknown>;
		};
		expect(json.success).toBe(false);
		expect(json.error.name).toBe("SubatomError");
		expect(json.error.code).toBe("BAD_REQUEST");
		expect(json.error.message).toBe("Debuggable error");
		expect(json.error.requestId).toBe("req-debug");
		expect(json.error.traceId).toBe("trace-debug");
		expect(json.error.validationErrors).toBeDefined();
		expect(json.error.details).toBeDefined();
		expect(json.error.stack).toBeDefined();
	});

	test("omits stack trace in production mode", () => {
		process.env.NODE_ENV = "production";
		const err = new HandlerSubatomError({ message: "Prod error" });
		const json = err.toJSON() as {
			success: boolean;
			error: Record<string, unknown>;
		};
		expect(json.error.stack).toBeUndefined();
		process.env.NODE_ENV = originalNodeEnv;
	});

	test("safely serializes circular references, bigints, and omits functions/symbols", () => {
		const circularObj: Record<string, unknown> = { num: 10n };
		circularObj.self = circularObj;
		circularObj.fn = () => "hello";
		circularObj.sym = Symbol("test");

		const err = new HandlerSubatomError({
			message: "Circular test",
			details: circularObj,
		});

		const json = err.toJSON() as {
			success: boolean;
			error: { details: Record<string, unknown> };
		};
		expect(json.error.details.num).toBe("10");
		expect(json.error.details.self).toBe("[Circular]");
		expect(json.error.details.fn).toBeUndefined();
		expect(json.error.details.sym).toBeUndefined();
	});

	test("falls back cleanly if toJSON serialization throws", () => {
		const err = new HandlerSubatomError({ message: "Resilient error" });
		Object.defineProperty(err, "name", {
			get() {
				throw new Error("Property read error");
			},
		});

		const json = err.toJSON() as {
			success: boolean;
			error: Record<string, unknown>;
		};
		expect(json.success).toBe(false);
		expect(json.error.name).toBe("SubatomError");
		expect(json.error.code).toBe("INTERNAL_SERVER_ERROR");
		expect(json.error.statusCode).toBe(500);
	});
});

describe("Framework Errors", () => {
	it("should instantiate SubatomError with defaults", () => {
		const err = new SubatomError("Internal breakdown");
		expect(err.name).toBe("SubatomError");
		expect(err.message).toBe("Internal breakdown");
		expect(err.statusCode).toBe(500);
		expect(err.errorCode).toBe("INTERNAL_SERVER_ERROR");
		expect(err.isOperational).toBe(true);
		expect(err.details).toBeUndefined();
	});

	it("should instantiate SubatomError with custom options", () => {
		const err = new SubatomError("Custom issue", {
			statusCode: 503,
			errorCode: "SERVICE_UNAVAILABLE",
			details: { retryAfter: 30 },
			isOperational: false,
		});
		expect(err.statusCode).toBe(503);
		expect(err.errorCode).toBe("SERVICE_UNAVAILABLE");
		expect(err.details).toEqual({ retryAfter: 30 });
		expect(err.isOperational).toBe(false);
	});

	it("should instantiate NotFoundError", () => {
		const errDefault = new NotFoundError();
		expect(errDefault.statusCode).toBe(404);
		expect(errDefault.errorCode).toBe("NOT_FOUND");
		expect(errDefault.message).toBe("Resource Not Found");

		const errCustom = new NotFoundError("User not found");
		expect(errCustom.message).toBe("User not found");
	});

	it("should instantiate BadRequestError with optional details", () => {
		const err = new BadRequestError("Invalid param", { field: "email" });
		expect(err.statusCode).toBe(400);
		expect(err.errorCode).toBe("BAD_REQUEST");
		expect(err.details).toEqual({ field: "email" });
	});

	it("should instantiate MethodNotAllowedError", () => {
		const err = new MethodNotAllowedError();
		expect(err.statusCode).toBe(405);
		expect(err.errorCode).toBe("METHOD_NOT_ALLOWED");
	});

	it("should instantiate PayloadTooLargeError", () => {
		const err = new PayloadTooLargeError();
		expect(err.statusCode).toBe(413);
		expect(err.errorCode).toBe("PAYLOAD_TOO_LARGE");
	});

	it("should instantiate UnprocessableEntityError", () => {
		const err = new UnprocessableEntityError("Validation failed", [
			{ rule: "required" },
		]);
		expect(err.statusCode).toBe(422);
		expect(err.errorCode).toBe("UNPROCESSABLE_ENTITY");
		expect(err.details).toEqual([{ rule: "required" }]);
	});

	it("should instantiate FileFilterError", () => {
		const err = new FileFilterError("Only images allowed");
		expect(err.name).toBe("FileFilterError");
		expect(err.statusCode).toBe(422);
		expect(err.message).toBe("Only images allowed");
	});

	describe("normalizeError", () => {
		it("should return existing Error instances untouched", () => {
			const original = new Error("Native error");
			expect(normalizeError(original)).toBe(original);
		});

		it("should wrap strings into SubatomError", () => {
			const err = normalizeError("Something broke");
			expect(err).toBeInstanceOf(SubatomError);
			expect(err.message).toBe("Something broke");
		});

		it("should wrap non-Error values and attach details", () => {
			const nonError = { code: 500, info: "corrupt" };
			const err = normalizeError(nonError) as SubatomError;
			expect(err).toBeInstanceOf(SubatomError);
			expect(err.message).toBe(
				"A non-Error value was thrown during request handling.",
			);
			expect(err.details).toBe(nonError);
		});
	});
});

describe("Errors", () => {
	it("should instantiate SubatomError with defaults and custom options", () => {
		const defaultErr = new SubatomError("Default error");
		expect(defaultErr.name).toBe("SubatomError");
		expect(defaultErr.statusCode).toBe(500);
		expect(defaultErr.errorCode).toBe("INTERNAL_SERVER_ERROR");
		expect(defaultErr.isOperational).toBe(true);
		expect(defaultErr.details).toBeUndefined();

		const customErr = new SubatomError("Custom error", {
			statusCode: 503,
			errorCode: "SERVICE_UNAVAILABLE",
			details: { info: "db down" },
			isOperational: false,
		});
		expect(customErr.statusCode).toBe(503);
		expect(customErr.errorCode).toBe("SERVICE_UNAVAILABLE");
		expect(customErr.details).toEqual({ info: "db down" });
		expect(customErr.isOperational).toBe(false);
	});

	it("should instantiate NotFoundError with default and custom message", () => {
		const def = new NotFoundError();
		expect(def.message).toBe("Resource Not Found");
		expect(def.statusCode).toBe(404);
		expect(def.errorCode).toBe("NOT_FOUND");

		const custom = new NotFoundError("User missing");
		expect(custom.message).toBe("User missing");
	});

	it("should instantiate BadRequestError with default and custom values", () => {
		const def = new BadRequestError();
		expect(def.message).toBe("Bad Request");
		expect(def.statusCode).toBe(400);
		expect(def.errorCode).toBe("BAD_REQUEST");

		const custom = new BadRequestError("Invalid param", { field: "id" });
		expect(custom.message).toBe("Invalid param");
		expect(custom.details).toEqual({ field: "id" });
	});

	it("should instantiate MethodNotAllowedError with default and custom message", () => {
		const def = new MethodNotAllowedError();
		expect(def.message).toBe("Method Not Allowed");
		expect(def.statusCode).toBe(405);
		expect(def.errorCode).toBe("METHOD_NOT_ALLOWED");

		const custom = new MethodNotAllowedError("POST not allowed");
		expect(custom.message).toBe("POST not allowed");
	});

	it("should instantiate PayloadTooLargeError with default and custom message", () => {
		const def = new PayloadTooLargeError();
		expect(def.message).toBe("Payload Too Large");
		expect(def.statusCode).toBe(413);
		expect(def.errorCode).toBe("PAYLOAD_TOO_LARGE");

		const custom = new PayloadTooLargeError("File too big");
		expect(custom.message).toBe("File too big");
	});

	it("should instantiate UnprocessableEntityError with default and custom values", () => {
		const def = new UnprocessableEntityError();
		expect(def.message).toBe("Unprocessable Entity");
		expect(def.statusCode).toBe(422);
		expect(def.errorCode).toBe("UNPROCESSABLE_ENTITY");

		const custom = new UnprocessableEntityError("Unprocessable", {
			field: "age",
		});
		expect(custom.message).toBe("Unprocessable");
		expect(custom.details).toEqual({ field: "age" });
	});

	it("should instantiate FileFilterError with default and custom message", () => {
		const def = new FileFilterError();
		expect(def.name).toBe("FileFilterError");
		expect(def.message).toBe("File type not allowed");
		expect(def.statusCode).toBe(422);
		expect(def.errorCode).toBe("UNPROCESSABLE_ENTITY");

		const custom = new FileFilterError("Disallowed ext");
		expect(custom.name).toBe("FileFilterError");
		expect(custom.message).toBe("Disallowed ext");
	});

	describe("normalizeError", () => {
		it("should return existing Error instances as-is", () => {
			const original = new Error("Standard error");
			expect(normalizeError(original)).toBe(original);

			const subatom = new BadRequestError("Subatom error");
			expect(normalizeError(subatom)).toBe(subatom);
		});

		it("should wrap strings in SubatomError", () => {
			const result = normalizeError("Something broke");
			expect(result).toBeInstanceOf(SubatomError);
			expect(result.message).toBe("Something broke");
		});

		it("should wrap non-Error values and attach them to details", () => {
			const obj = { error: "failed" };
			const resultObj = normalizeError(obj) as SubatomError;
			expect(resultObj).toBeInstanceOf(SubatomError);
			expect(resultObj.message).toBe(
				"A non-Error value was thrown during request handling.",
			);
			expect(resultObj.details).toBe(obj);

			const num = 404;
			const resultNum = normalizeError(num) as SubatomError;
			expect(resultNum.details).toBe(404);
		});
	});
});

describe("Subatom Framework Errors Hierarchy", () => {
	describe("SubatomError", () => {
		test("initializes with default options", () => {
			const err = new SubatomError("Default failure");
			expect(err.message).toBe("Default failure");
			expect(err.name).toBe("SubatomError");
			expect(err.statusCode).toBe(500);
			expect(err.errorCode).toBe("INTERNAL_SERVER_ERROR");
			expect(err.details).toBeUndefined();
			expect(err.isOperational).toBe(true);
			expect(err.stack).toBeDefined();
		});

		test("accepts empty options and falsy statusCode", () => {
			const err = new SubatomError("Falsy status", {
				statusCode: 0,
				errorCode: "",
			});
			expect(err.statusCode).toBe(500);
			expect(err.errorCode).toBe("INTERNAL_SERVER_ERROR");
			expect(err.isOperational).toBe(true);
		});

		test("accepts custom parameters and overrides", () => {
			const details = { field: "username" };
			const err = new SubatomError("Custom failure", {
				statusCode: 418,
				errorCode: "TEAPOT",
				details,
				isOperational: false,
			});
			expect(err.statusCode).toBe(418);
			expect(err.errorCode).toBe("TEAPOT");
			expect(err.details).toBe(details);
			expect(err.isOperational).toBe(false);
		});
	});

	describe("Built-in Error Subclasses", () => {
		test("NotFoundError initializes with defaults and custom message", () => {
			const def = new NotFoundError();
			expect(def.message).toBe("Resource Not Found");
			expect(def.statusCode).toBe(404);
			expect(def.errorCode).toBe("NOT_FOUND");

			const custom = new NotFoundError("User missing");
			expect(custom.message).toBe("User missing");
			expect(custom.statusCode).toBe(404);
		});

		test("BadRequestError initializes with defaults and custom details", () => {
			const def = new BadRequestError();
			expect(def.message).toBe("Bad Request");
			expect(def.statusCode).toBe(400);
			expect(def.errorCode).toBe("BAD_REQUEST");
			expect(def.details).toBeUndefined();

			const err = new BadRequestError("Invalid payload", { key: "missing" });
			expect(err.message).toBe("Invalid payload");
			expect(err.details).toEqual({ key: "missing" });
		});

		test("MethodNotAllowedError initializes with default and custom message", () => {
			const def = new MethodNotAllowedError();
			expect(def.message).toBe("Method Not Allowed");
			expect(def.statusCode).toBe(405);
			expect(def.errorCode).toBe("METHOD_NOT_ALLOWED");

			const custom = new MethodNotAllowedError("POST disallowed");
			expect(custom.message).toBe("POST disallowed");
		});

		test("PayloadTooLargeError initializes correctly", () => {
			const def = new PayloadTooLargeError();
			expect(def.message).toBe("Payload Too Large");
			expect(def.statusCode).toBe(413);
			expect(def.errorCode).toBe("PAYLOAD_TOO_LARGE");

			const custom = new PayloadTooLargeError("Max size 10MB");
			expect(custom.message).toBe("Max size 10MB");
		});

		test("UnprocessableEntityError initializes correctly", () => {
			const def = new UnprocessableEntityError();
			expect(def.message).toBe("Unprocessable Entity");
			expect(def.statusCode).toBe(422);
			expect(def.errorCode).toBe("UNPROCESSABLE_ENTITY");

			const custom = new UnprocessableEntityError("Validation failed", [
				"err1",
			]);
			expect(custom.details).toEqual(["err1"]);
		});

		test("FileFilterError overrides name property and initializes defaults", () => {
			const def = new FileFilterError();
			expect(def.message).toBe("File type not allowed");
			expect(def.name).toBe("FileFilterError");
			expect(def.statusCode).toBe(422);

			const custom = new FileFilterError("Only PNGs allowed");
			expect(custom.message).toBe("Only PNGs allowed");
		});
	});

	describe("normalizeError", () => {
		test("returns standard Error instances unchanged", () => {
			const original = new Error("Native error");
			expect(normalizeError(original)).toBe(original);
		});

		test("wraps string inputs in SubatomError", () => {
			const result = normalizeError("Something blew up");
			expect(result).toBeInstanceOf(SubatomError);
			expect(result.message).toBe("Something blew up");
		});

		test("wraps non-error objects with details preserved", () => {
			const rawPayload = { status: "failed", reason: 404 };
			const result = normalizeError(rawPayload) as SubatomError;
			expect(result).toBeInstanceOf(SubatomError);
			expect(result.message).toBe(
				"A non-Error value was thrown during request handling.",
			);
			expect(result.details).toBe(rawPayload);
		});

		test("wraps primitives like null and undefined", () => {
			const resultNull = normalizeError(null) as SubatomError;
			expect(resultNull).toBeInstanceOf(SubatomError);
			expect(resultNull.details).toBeNull();

			const resultUndefined = normalizeError(undefined) as SubatomError;
			expect(resultUndefined.details).toBeUndefined();
		});
	});
});
