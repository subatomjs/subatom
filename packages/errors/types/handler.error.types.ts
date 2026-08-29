/**
 * @fileoverview Type file of global handler error. (err, req, res, next).
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
export type ErrorSeverity = "fatal" | "error" | "warn" | "info";

export interface IValidationErrorDetail {
	readonly path: string | Array<string | number>;
	readonly message: string;
	readonly rule?: string;
	readonly expected?: string;
	readonly received?: unknown;
}

/**
 * Standard production-grade error interface for Subatom.
 * Extends Error to inherit name, message, stack, and cause cleanly.
 */
export interface IHandlerError<TDetails = unknown> extends Error {
	status: number;
	statusCode: number;
	code: string;
	isOperational: boolean;
	severity: ErrorSeverity;

	// Custom optional properties compatible with exactOptionalPropertyTypes
	details?: TDetails | undefined;
	validationErrors?: IValidationErrorDetail[] | undefined;
	traceId?: string | undefined;
	requestId?: string | undefined;
	headers?: Record<string, string | number | string[]> | undefined;
	timestamp: string;

	toJSON(): Record<string, unknown>;
}

export interface IHandlerErrorOptions<TDetails = unknown> {
	message?: string | undefined;
	statusCode?: number | undefined;
	code?: string | undefined;
	isOperational?: boolean | undefined;
	severity?: ErrorSeverity | undefined;
	details?: TDetails | undefined;
	validationErrors?: IValidationErrorDetail[] | undefined;
	cause?: unknown;
	headers?: Record<string, string | number | string[]> | undefined;
	requestId?: string | undefined;
	traceId?: string | undefined;
}

export type ErrorRequestHandler<
	TErr extends IHandlerError = IHandlerError,
	TReq = any,
	TRes = any,
	TNext = (err?: unknown) => void | Promise<void>,
> = (err: TErr, req: TReq, res: TRes, next: TNext) => void | Promise<void>;

// ============================================================================
// HELPER: SAFE JSON SERIALIZER
// ============================================================================

function safeSerialize(obj: unknown): unknown {
	const seen = new WeakSet();
	return JSON.parse(
		JSON.stringify(obj, (_key, value) => {
			if (typeof value === "bigint") {
				return value.toString();
			}
			if (typeof value === "function" || typeof value === "symbol") {
				return undefined;
			}
			if (typeof value === "object" && value !== null) {
				if (seen.has(value)) {
					return "[Circular]";
				}
				seen.add(value);
			}
			return value;
		}) || "{}",
	);
}

// ============================================================================
// BASE ERROR CLASS
// ============================================================================

export class SubatomError<TDetails = unknown>
	extends Error
	implements IHandlerError<TDetails>
{
	public status: number;
	public statusCode: number;
	public code: string;
	public isOperational: boolean;
	public severity: ErrorSeverity;

	public details?: TDetails | undefined;
	public validationErrors?: IValidationErrorDetail[] | undefined;
	public traceId?: string | undefined;
	public requestId?: string | undefined;
	public headers?: Record<string, string | number | string[]> | undefined;
	public timestamp: string;

	constructor(options: IHandlerErrorOptions<TDetails> = {}) {
		const safeMessage =
			typeof options.message === "string" && options.message.trim().length > 0
				? options.message
				: "An internal server error occurred.";

		super(safeMessage, { cause: options.cause });

		this.name = this.constructor.name || "SubatomError";

		const rawStatus = Number(options.statusCode);
		const validStatus =
			Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599
				? rawStatus
				: 500;

		this.status = validStatus;
		this.statusCode = validStatus;
		this.code =
			typeof options.code === "string" && options.code.length > 0
				? options.code
				: validStatus >= 500
					? "INTERNAL_SERVER_ERROR"
					: "BAD_REQUEST";

		this.isOperational = options.isOperational ?? this.statusCode < 500;
		this.severity =
			options.severity ?? (this.statusCode >= 500 ? "error" : "warn");

		if (options.details !== undefined) this.details = options.details;
		if (options.validationErrors !== undefined)
			this.validationErrors = options.validationErrors;
		if (options.headers !== undefined) this.headers = options.headers;
		if (options.requestId !== undefined) this.requestId = options.requestId;
		if (options.traceId !== undefined) this.traceId = options.traceId;

		this.timestamp = new Date().toISOString();

		if (typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	public toJSON(): Record<string, unknown> {
		try {
			const isProd = process.env.NODE_ENV === "production";

			const payload: Record<string, unknown> = {
				success: false,
				error: {
					name: this.name,
					code: this.code,
					message: this.message,
					statusCode: this.statusCode,
					timestamp: this.timestamp,
					...(this.requestId !== undefined && { requestId: this.requestId }),
					...(this.traceId !== undefined && { traceId: this.traceId }),
					...(this.validationErrors !== undefined && {
						validationErrors: this.validationErrors,
					}),
					...(this.details !== undefined && { details: this.details }),
					...(!isProd && this.stack ? { stack: this.stack } : {}),
				},
			};

			return safeSerialize(payload) as Record<string, unknown>;
		} catch {
			return {
				success: false,
				error: {
					name: "SubatomError",
					code: "INTERNAL_SERVER_ERROR",
					message: this.message || "Internal Server Error",
					statusCode: 500,
					timestamp: new Date().toISOString(),
				},
			};
		}
	}
}
