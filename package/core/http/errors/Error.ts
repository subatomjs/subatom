// types/Error.ts
export interface SubatomErrorDetails {
	statusCode?: number;
	errorCode?: string;
	details?: any;
	isOperational?: boolean;
}

export class SubatomError extends Error {
	public readonly statusCode: number;
	public readonly errorCode: string;
	public readonly details?: any;
	public readonly isOperational: boolean;

	constructor(message: string, options: SubatomErrorDetails = {}) {
		super(message);
		this.name = this.constructor.name;
		this.statusCode = options.statusCode || 500;
		this.errorCode = options.errorCode || "INTERNAL_SERVER_ERROR";
		this.details = options.details;
		this.isOperational = options.isOperational ?? true;

		Error.captureStackTrace(this, this.constructor);
	}
}

// Common Built-in Subatom Framework Errors
export class NotFoundError extends SubatomError {
	constructor(message = "Resource Not Found") {
		super(message, { statusCode: 404, errorCode: "NOT_FOUND" });
	}
}

export class BadRequestError extends SubatomError {
	constructor(message = "Bad Request", details?: any) {
		super(message, { statusCode: 400, errorCode: "BAD_REQUEST", details });
	}
}

export class MethodNotAllowedError extends SubatomError {
	constructor(message = "Method Not Allowed") {
		super(message, { statusCode: 405, errorCode: "METHOD_NOT_ALLOWED" });
	}
}

export class PayloadTooLargeError extends SubatomError {
	constructor(message = "Payload Too Large") {
		super(message, { statusCode: 413, errorCode: "PAYLOAD_TOO_LARGE" });
	}
}

export class UnprocessableEntityError extends SubatomError {
	constructor(message = "Unprocessable Entity", details?: any) {
		super(message, {
			statusCode: 422,
			errorCode: "UNPROCESSABLE_ENTITY",
			details,
		});
	}
}

export class FileFilterError extends UnprocessableEntityError {
	constructor(message = "File type not allowed") {
		super(message);
		this.name = "FileFilterError";
	}
}

/**
 * Coerces an arbitrary caught/thrown value into a proper Error instance.
 * JavaScript allows `throw`-ing anything (null, undefined, a string, a
 * plain object, a rejected promise with no reason, ...); this guarantees
 * downstream code (ErrorFormatter, logging, user-defined error
 * middleware) can safely assume `.message` / `.stack` exist without
 * re-checking. Real Error instances are returned as-is (preserving their
 * original stack trace); everything else is wrapped.
 */
export function normalizeError(err: unknown): Error {
	if (err instanceof Error) {
		return err;
	}
	if (typeof err === "string") {
		return new SubatomError(err);
	}
	return new SubatomError(
		"A non-Error value was thrown during request handling.",
		{ details: err },
	);
}
