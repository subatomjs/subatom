/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * @fileoverview
 * FileUploadPipeline provides configurable middleware factories
 * (single, array, fields, anyFiles, none) to parse, validate,
 * and process multipart/form-data requests across memory and disk storage strategies.
 * It extracts stream data and headers from native or wrapped HTTP requests,
 * attaches parsed fields and file instances to req.body, req.file, and req.files,
 * and ensures resource cleanup alongside immediate client error responses when
 * payload or count limits are exceeded.
 */

import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { NextFunction } from "../next/types/nextFunction.types.js";
import type {
	FileUploadPipelineOptions,
	IFrameworkRequest,
	IFileUpload,
	DocumentedMiddleware,
	ResponseTarget,
	RequestTarget,
} from "./types/files.types.js";
import {
	BadRequestError,
	PayloadTooLargeError,
	UnprocessableEntityError,
} from "../../errors/Errors.js";
import { parseMultipart } from "./parseMultipart.js";

/**
 * Writes the error response directly to the client instead of relying on
 * `next(err)` to bubble through framework-level error middleware.
 */
function sendUploadError(res: ResponseTarget, err: unknown): boolean {
	const status =
		err instanceof PayloadTooLargeError
			? 413
			: err instanceof UnprocessableEntityError
				? 422
				: err instanceof BadRequestError
					? 400
					: 500;

	const message = err instanceof Error ? err.message : "Internal server error";
	const payload = JSON.stringify({ error: message });

	try {
		const rawRes =
			"raw" in res && res.raw
				? res.raw
				: "rawResponse" in res && res.rawResponse
					? res.rawResponse
					: (res as ServerResponse);

		if (rawRes && typeof rawRes.writeHead === "function") {
			if (rawRes.headersSent) return false;
			rawRes.writeHead(status, { "Content-Type": "application/json" });
			rawRes.end(payload);
			return true;
		}

		if (
			"status" in res &&
			typeof res.status === "function" &&
			"json" in res &&
			typeof res.json === "function"
		) {
			res.status(status).json({ error: message });
			return true;
		}

		if ("writeHead" in res && typeof res.writeHead === "function") {
			if (res.headersSent) return false;
			res.writeHead(status, { "Content-Type": "application/json" });
			if (typeof res.end === "function") {
				res.end(payload);
			}
			return true;
		}
	} catch {
		// fall through - couldn't write directly, let caller decide fallback
	}
	return false;
}

/**
 * Safe stream and headers extractor supporting Subatom Request wrapper and raw Node streams
 */
function getStreamAndHeaders(req: RequestTarget): {
	stream: Readable;
	headers: IncomingHttpHeaders;
} {
	const stream: Readable =
		"getStream" in req && typeof req.getStream === "function"
			? req.getStream()
			: "raw" in req && req.raw instanceof Readable
				? req.raw
				: (req as unknown as Readable);

	const headers: IncomingHttpHeaders =
		"getHeaders" in req && typeof req.getHeaders === "function"
			? req.getHeaders()
			: ((req.headers ?? {}) as IncomingHttpHeaders);

	return { stream, headers };
}

/**
 * Validates whether the incoming request is multipart/form-data
 */
function isMultipartRequest(headers: IncomingHttpHeaders): boolean {
	const contentType = headers["content-type"] || "";
	const headerStr = Array.isArray(contentType)
		? contentType.join(";")
		: contentType;
	return headerStr.includes("multipart/form-data");
}

/**
 * Single File Upload Middleware
 */
export function single(
	fieldname: string,
	options: FileUploadPipelineOptions = { storage: "memory" },
): DocumentedMiddleware {
	const handler: DocumentedMiddleware = async (
		req: IFrameworkRequest,
		res: ServerResponse,
		next: NextFunction,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			req.body = { ...(req.body ?? {}), ...body };
			req.files = files;

			const fieldFiles = files[fieldname] || [];
			if (fieldFiles.length > 0) {
				req.file = fieldFiles[0];
			}

			return next();
		} catch (err) {
			if (sendUploadError(res, err)) return;
			return next(err instanceof Error ? err : new Error(String(err)));
		}
	};

	handler._fileConfig = {
		type: "single",
		fieldname,
		options,
	};

	return handler;
}

/**
 * Array File Upload Middleware (Multiple files under same field)
 */
export function array(
	fieldname: string,
	maxCount?: number,
	options: FileUploadPipelineOptions = { storage: "memory" },
): DocumentedMiddleware {
	const handler: DocumentedMiddleware = async (
		req: IFrameworkRequest,
		res: ServerResponse,
		next: NextFunction,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			req.body = { ...(req.body ?? {}), ...body };

			const matchedFiles = files[fieldname] || [];

			if (maxCount && matchedFiles.length > maxCount) {
				await cleanupFiles(files);
				const tooMany = new PayloadTooLargeError(
					`Too many files uploaded for field '${fieldname}'. Max allowed: ${maxCount}`,
				);
				if (sendUploadError(res, tooMany)) return;
				return next(tooMany);
			}

			req.files = matchedFiles;
			if (matchedFiles[0]) {
				req.file = matchedFiles[0];
			}

			return next();
		} catch (err) {
			if (sendUploadError(res, err)) return;
			return next(err instanceof Error ? err : new Error(String(err)));
		}
	};

	handler._fileConfig = {
		type: "array",
		fieldname,
		maxCount,
		options,
	};

	return handler;
}

/**
 * Fields Upload Middleware (Multiple named file fields with individual limits)
 */
export function fields(
	fieldsConfig: Array<{ name: string; maxCount?: number }>,
	options: FileUploadPipelineOptions = { storage: "memory" },
): DocumentedMiddleware {
	const handler: DocumentedMiddleware = async (
		req: IFrameworkRequest,
		res: ServerResponse,
		next: NextFunction,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			req.body = { ...(req.body ?? {}), ...body };

			const resultFiles: Record<string, IFileUpload[]> = Object.create(null);

			for (let i = 0; i < fieldsConfig.length; i++) {
				const field = fieldsConfig[i];
				if (!field) continue;

				const matched = files[field.name] || [];

				if (field.maxCount && matched.length > field.maxCount) {
					await cleanupFiles(files);
					const tooMany = new PayloadTooLargeError(
						`Exceeded maximum file count (${field.maxCount}) for field '${field.name}'`,
					);
					if (sendUploadError(res, tooMany)) return;
					return next(tooMany);
				}
				resultFiles[field.name] = matched;
			}

			req.files = resultFiles;
			return next();
		} catch (err) {
			if (sendUploadError(res, err)) return;
			return next(err instanceof Error ? err : new Error(String(err)));
		}
	};

	handler._fileConfig = {
		type: "fields",
		fields: fieldsConfig,
		options,
	};

	return handler;
}

/**
 * Accepts ANY uploaded files across any fields
 */
export function anyFiles(
	options: FileUploadPipelineOptions = { storage: "memory" },
): DocumentedMiddleware {
	const handler: DocumentedMiddleware = async (
		req: IFrameworkRequest,
		res: ServerResponse,
		next: NextFunction,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			req.body = { ...(req.body ?? {}), ...body };
			req.files = files;

			return next();
		} catch (err) {
			if (sendUploadError(res, err)) return;
			return next(err instanceof Error ? err : new Error(String(err)));
		}
	};

	handler._fileConfig = {
		type: "any",
		options,
	};

	return handler;
}

/**
 * Rejects ALL file uploads (Allows text/form fields only)
 */
export function none(
	options: FileUploadPipelineOptions = { storage: "memory" },
): DocumentedMiddleware {
	const handler: DocumentedMiddleware = async (
		req: IFrameworkRequest,
		res: ServerResponse,
		next: NextFunction,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			if (Object.keys(files).length > 0) {
				await cleanupFiles(files);
				const notAllowed = new BadRequestError(
					"File uploads are not permitted on this endpoint",
				);
				if (sendUploadError(res, notAllowed)) return;
				return next(notAllowed);
			}

			req.body = { ...(req.body ?? {}), ...body };
			return next();
		} catch (err) {
			if (sendUploadError(res, err)) return;
			return next(err instanceof Error ? err : new Error(String(err)));
		}
	};

	handler._fileConfig = {
		type: "none",
		options,
	};

	return handler;
}

/**
 * Purges disk/memory references for parsed file maps.
 */
async function cleanupFiles(
	filesMap: Record<string, IFileUpload[]>,
): Promise<void> {
	const destroyTasks: Promise<void>[] = [];
	for (const field in filesMap) {
		const fileList = filesMap[field];
		if (!fileList) continue;
		for (let i = 0; i < fileList.length; i++) {
			const file = fileList[i];
			if (file) {
				destroyTasks.push(Promise.resolve(file.destroy()).catch(() => {}));
			}
		}
	}
	await Promise.all(destroyTasks);
}
