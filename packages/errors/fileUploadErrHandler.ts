/**
 * @fileoverview Handles file upload errors across Subatom, Express-like, and raw Node.js responses,
 * mapping known errors to HTTP status codes.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	IFrameworkRequest,
	ErrorHandlerResponse,
} from "../pipelines/files/types/files.types.js";
import type { NextFunction } from "../pipelines/next/types/nextFunction.types.js";
import {
	BadRequestError,
	PayloadTooLargeError,
	UnprocessableEntityError,
} from "./Errors.js";

/**
 * Register this LAST in your middleware chain (after all routes and other
 * middleware). Every `next(err)` call from single()/array()/fields()/
 * anyFiles()/none() ends up here.
 */
export function fileUploadErrorHandler(
	err: unknown,
	_req: IFrameworkRequest,
	res: ErrorHandlerResponse,
	next: NextFunction,
): void {
	if (!err) {
		next();
		return;
	}

	const status = statusFor(err);
	const message = (err as Error)?.message || "Internal server error";
	const payload = JSON.stringify({ error: message });

	// 1. Subatom / Wrapped-response pattern (matches res.raw or res.rawResponse)
	const rawNodeRes =
		"raw" in res && res.raw
			? res.raw
			: "rawResponse" in res && res.rawResponse
				? res.rawResponse
				: undefined;

	if (rawNodeRes && typeof rawNodeRes.writeHead === "function") {
		if (!rawNodeRes.headersSent) {
			rawNodeRes.writeHead(status, { "Content-Type": "application/json" });
			rawNodeRes.end(payload);
		}
		return;
	}

	// 2. Express-like chaining API (res.status(code).json(body))
	if (
		"status" in res &&
		typeof res.status === "function" &&
		!("writeHead" in res && typeof res.writeHead === "function")
	) {
		res.status(status).json({ error: message });
		return;
	}

	// 3. Raw Node.js http.ServerResponse API
	if ("writeHead" in res && typeof res.writeHead === "function") {
		if (!res.headersSent) {
			res.writeHead(status, { "Content-Type": "application/json" });
			if (typeof res.end === "function") {
				res.end(payload);
			}
		}
		return;
	}

	// Last resort: rethrow so it doesn't fail completely silently
	throw err;
}

function statusFor(err: unknown): number {
	if (err instanceof PayloadTooLargeError) return 413;
	if (err instanceof UnprocessableEntityError) return 422;
	if (err instanceof BadRequestError) return 400;
	return 500;
}
