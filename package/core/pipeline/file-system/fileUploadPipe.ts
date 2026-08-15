import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type {
	FileUploadPipelineOptions,
	IFrameworkRequest,
	IUploadFile,
	Middleware,
} from "../../../types/framework/pipeline/IUploadFile.js";
import {
	BadRequestError,
	PayloadTooLargeError,
	UnprocessableEntityError,
} from "../../http/errors/Error.js";
import { parseMultipart } from "./multipartParser.js";

export interface FileConfigMeta {
	type: "single" | "array" | "fields" | "any" | "none";
	fieldname?: string | undefined;
	maxCount?: number | undefined;
	fields?: Array<{ name: string; maxCount?: number | undefined }> | undefined;
	options?: FileUploadPipelineOptions | undefined;
}

export interface DocumentedMiddleware extends Middleware {
	_fileConfig?: FileConfigMeta;
}

/**
 * Writes the error response directly to the client instead of relying on
 * `next(err)` to bubble through framework-level error middleware.
 */
function sendUploadError(res: any, err: unknown): boolean {
	const status =
		err instanceof PayloadTooLargeError
			? 413
			: err instanceof UnprocessableEntityError
				? 422
				: err instanceof BadRequestError
					? 400
					: 500;

	const message = (err as Error)?.message || "Internal server error";
	const payload = JSON.stringify({ error: message });

	try {
		if (res.raw && typeof res.raw.writeHead === "function") {
			if (res.raw.headersSent) return false;
			res.raw.writeHead(status, { "Content-Type": "application/json" });
			res.raw.end(payload);
			return true;
		}
		if (typeof res.status === "function" && typeof res.json === "function") {
			res.status(status).json({ error: message });
			return true;
		}
		if (typeof res.writeHead === "function") {
			if (res.headersSent) return false;
			res.writeHead(status, { "Content-Type": "application/json" });
			res.end(payload);
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
function getStreamAndHeaders(req: any): {
	stream: Readable;
	headers: IncomingHttpHeaders;
} {
	const stream =
		typeof req.getStream === "function" ? req.getStream() : req.raw || req;
	const headers =
		typeof req.getHeaders === "function" ? req.getHeaders() : req.headers || {};

	return { stream, headers };
}

/**
 * Validates whether the incoming request is multipart/form-data
 */
function isMultipartRequest(headers: IncomingHttpHeaders): boolean {
	const contentType = (headers["content-type"] as string) || "";
	return contentType.includes("multipart/form-data");
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
		res: any,
		next: (err?: any) => void,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			req.body = { ...(req.body as object), ...body };
			req.files = files;

			const fieldFiles = files[fieldname] || [];
			if (fieldFiles.length > 0) {
				req.file = fieldFiles[0];
			}

			return next();
		} catch (err) {
			if (sendUploadError(res, err)) return;
			return next(err);
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
		res: any,
		next: (err?: any) => void,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			req.body = { ...(req.body as object), ...body };

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
			return next(err);
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
		res: any,
		next: (err?: any) => void,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			req.body = { ...(req.body as object), ...body };

			const resultFiles: Record<string, IUploadFile[]> = Object.create(null);

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
			return next(err);
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
		res: any,
		next: (err?: any) => void,
	) => {
		const { stream, headers } = getStreamAndHeaders(req);

		if (!isMultipartRequest(headers)) {
			return next();
		}

		try {
			const { body, files } = await parseMultipart(stream, headers, options);

			req.body = { ...(req.body as object), ...body };
			req.files = files;

			return next();
		} catch (err) {
			if (sendUploadError(res, err)) return;
			return next(err);
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
		res: any,
		next: (err?: any) => void,
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

			req.body = { ...(req.body as object), ...body };
			return next();
		} catch (err) {
			if (sendUploadError(res, err)) return;
			return next(err);
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
	filesMap: Record<string, IUploadFile[]>,
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

// import type { IncomingHttpHeaders } from "node:http";
// import type { Readable } from "node:stream";
// import type {
// 	FileUploadPipelineOptions,
// 	IFrameworkRequest,
// 	IUploadFile,
// 	Middleware,
// } from "../../../types/framework/pipeline/IUploadFile.js";
// import {
// 	BadRequestError,
// 	PayloadTooLargeError,
// 	UnprocessableEntityError,
// } from "../../http/errors/Error.js";
// import { parseMultipart } from "./multipartParser.js";

// /**
//  * Writes the error response directly to the client instead of relying on
//  * `next(err)` to bubble through framework-level error middleware.
//  *
//  * Why: Error.stack is captured once at construction time and never
//  * changes, even when the error is later re-thrown. That means if
//  * `next(err)` throws or rejects somewhere deep inside Subatom's own
//  * dispatch logic (e.g. no error handler registered, or it throws while
//  * routing), the resulting "unhandled promise rejection" gets reported
//  * with THIS error's original stack - making it look like the crash is
//  * inside multipartParser/busboy, when it's actually framework routing
//  * that never caught the rejection.
//  *
//  * Sending the response directly here removes that dependency entirely:
//  * these are well-understood, expected validation errors and the client
//  * should just get a clean 4xx, full stop - no framework hop required.
//  *
//  * Returns true if a response was sent (caller should NOT call next()).
//  */
// function sendUploadError(res: any, err: unknown): boolean {
// 	const status =
// 		err instanceof PayloadTooLargeError
// 			? 413
// 			: err instanceof UnprocessableEntityError
// 				? 422
// 				: err instanceof BadRequestError
// 					? 400
// 					: 500;

// 	const message = (err as Error)?.message || "Internal server error";
// 	const payload = JSON.stringify({ error: message });

// 	try {
// 		if (res.raw && typeof res.raw.writeHead === "function") {
// 			if (res.raw.headersSent) return false;
// 			res.raw.writeHead(status, { "Content-Type": "application/json" });
// 			res.raw.end(payload);
// 			return true;
// 		}
// 		if (typeof res.status === "function" && typeof res.json === "function") {
// 			res.status(status).json({ error: message });
// 			return true;
// 		}
// 		if (typeof res.writeHead === "function") {
// 			if (res.headersSent) return false;
// 			res.writeHead(status, { "Content-Type": "application/json" });
// 			res.end(payload);
// 			return true;
// 		}
// 	} catch {
// 		// fall through - couldn't write directly, let caller decide fallback
// 	}
// 	return false;
// }

// /**
//  * Safe stream and headers extractor supporting Subatom Request wrapper and raw Node streams
//  */
// function getStreamAndHeaders(req: any): {
// 	stream: Readable;
// 	headers: IncomingHttpHeaders;
// } {
// 	const stream =
// 		typeof req.getStream === "function" ? req.getStream() : req.raw || req;
// 	const headers =
// 		typeof req.getHeaders === "function" ? req.getHeaders() : req.headers || {};

// 	return { stream, headers };
// }

// /**
//  * Validates whether the incoming request is multipart/form-data
//  */
// function isMultipartRequest(headers: IncomingHttpHeaders): boolean {
// 	const contentType = (headers["content-type"] as string) || "";
// 	return contentType.includes("multipart/form-data");
// }

// /**
//  * Single File Upload Middleware
//  */
// export function single(
// 	fieldname: string,
// 	options: FileUploadPipelineOptions = { storage: "memory" },
// ): Middleware {
// 	return async (
// 		req: IFrameworkRequest,
// 		res: any,
// 		next: (err?: any) => void,
// 	) => {
// 		const { stream, headers } = getStreamAndHeaders(req);

// 		if (!isMultipartRequest(headers)) {
// 			return next();
// 		}

// 		try {
// 			const { body, files } = await parseMultipart(stream, headers, options);

// 			req.body = { ...(req.body as object), ...body };
// 			req.files = files;

// 			const fieldFiles = files[fieldname] || [];
// 			if (fieldFiles.length > 0) {
// 				req.file = fieldFiles[0];
// 			}

// 			return next();
// 		} catch (err) {
// 			// parseMultipart already cleans up its own temp files/handles
// 			// internally on abort. Respond directly instead of trusting
// 			// next(err) to reach a framework error handler.
// 			if (sendUploadError(res, err)) return;
// 			return next(err); // fallback if we truly couldn't write a response
// 		}
// 	};
// }

// /**
//  * Array File Upload Middleware (Multiple files under same field)
//  */
// export function array(
// 	fieldname: string,
// 	maxCount?: number,
// 	options: FileUploadPipelineOptions = { storage: "memory" },
// ): Middleware {
// 	return async (
// 		req: IFrameworkRequest,
// 		res: any,
// 		next: (err?: any) => void,
// 	) => {
// 		const { stream, headers } = getStreamAndHeaders(req);

// 		if (!isMultipartRequest(headers)) {
// 			return next();
// 		}

// 		try {
// 			const { body, files } = await parseMultipart(stream, headers, options);

// 			req.body = { ...(req.body as object), ...body };

// 			const matchedFiles = files[fieldname] || [];

// 			// Check maxCount threshold
// 			if (maxCount && matchedFiles.length > maxCount) {
// 				await cleanupFiles(files); // await so response isn't sent before disk cleanup runs
// 				const tooMany = new PayloadTooLargeError(
// 					`Too many files uploaded for field '${fieldname}'. Max allowed: ${maxCount}`,
// 				);
// 				if (sendUploadError(res, tooMany)) return;
// 				return next(tooMany);
// 			}

// 			req.files = matchedFiles;
// 			if (matchedFiles[0]) {
// 				req.file = matchedFiles[0];
// 			}

// 			return next();
// 		} catch (err) {
// 			if (sendUploadError(res, err)) return;
// 			return next(err);
// 		}
// 	};
// }

// /**
//  * Fields Upload Middleware (Multiple named file fields with individual limits)
//  */
// export function fields(
// 	fieldsConfig: Array<{ name: string; maxCount?: number }>,
// 	options: FileUploadPipelineOptions = { storage: "memory" },
// ): Middleware {
// 	return async (
// 		req: IFrameworkRequest,
// 		res: any,
// 		next: (err?: any) => void,
// 	) => {
// 		const { stream, headers } = getStreamAndHeaders(req);

// 		if (!isMultipartRequest(headers)) {
// 			return next();
// 		}

// 		try {
// 			const { body, files } = await parseMultipart(stream, headers, options);

// 			req.body = { ...(req.body as object), ...body };

// 			const resultFiles: Record<string, IUploadFile[]> = Object.create(null);

// 			for (let i = 0; i < fieldsConfig.length; i++) {
// 				const field = fieldsConfig[i];
// 				if (!field) continue;

// 				const matched = files[field.name] || [];

// 				if (field.maxCount && matched.length > field.maxCount) {
// 					await cleanupFiles(files); // await
// 					const tooMany = new PayloadTooLargeError(
// 						`Exceeded maximum file count (${field.maxCount}) for field '${field.name}'`,
// 					);
// 					if (sendUploadError(res, tooMany)) return;
// 					return next(tooMany);
// 				}
// 				resultFiles[field.name] = matched;
// 			}

// 			req.files = resultFiles;
// 			return next();
// 		} catch (err) {
// 			if (sendUploadError(res, err)) return;
// 			return next(err);
// 		}
// 	};
// }

// /**
//  * Accepts ANY uploaded files across any fields
//  */
// export function anyFiles(
// 	options: FileUploadPipelineOptions = { storage: "memory" },
// ): Middleware {
// 	return async (
// 		req: IFrameworkRequest,
// 		res: any,
// 		next: (err?: any) => void,
// 	) => {
// 		const { stream, headers } = getStreamAndHeaders(req);

// 		if (!isMultipartRequest(headers)) {
// 			return next();
// 		}

// 		try {
// 			const { body, files } = await parseMultipart(stream, headers, options);

// 			req.body = { ...(req.body as object), ...body };
// 			req.files = files;

// 			return next();
// 		} catch (err) {
// 			if (sendUploadError(res, err)) return;
// 			return next(err);
// 		}
// 	};
// }

// /**
//  * Rejects ALL file uploads (Allows text/form fields only)
//  */
// export function none(
// 	options: FileUploadPipelineOptions = { storage: "memory" },
// ): Middleware {
// 	return async (
// 		req: IFrameworkRequest,
// 		res: any,
// 		next: (err?: any) => void,
// 	) => {
// 		const { stream, headers } = getStreamAndHeaders(req);

// 		if (!isMultipartRequest(headers)) {
// 			return next();
// 		}

// 		try {
// 			const { body, files } = await parseMultipart(stream, headers, options);

// 			// If any files were uploaded, throw BadRequestError and clean up
// 			if (Object.keys(files).length > 0) {
// 				await cleanupFiles(files); // await
// 				const notAllowed = new BadRequestError(
// 					"File uploads are not permitted on this endpoint",
// 				);
// 				if (sendUploadError(res, notAllowed)) return;
// 				return next(notAllowed);
// 			}

// 			req.body = { ...(req.body as object), ...body };
// 			return next();
// 		} catch (err) {
// 			if (sendUploadError(res, err)) return;
// 			return next(err);
// 		}
// 	};
// }

// /**
//  * Immediately purges disk/memory references for parsed file maps.
//  * NEW: now returns a Promise and is awaited by every caller above, so a
//  * response is never sent (and next() never called) before disk cleanup
//  * has actually completed. Previously this was fire-and-forget.
//  */
// async function cleanupFiles(
// 	filesMap: Record<string, IUploadFile[]>,
// ): Promise<void> {
// 	const destroyTasks: Promise<void>[] = [];
// 	for (const field in filesMap) {
// 		const fileList = filesMap[field];
// 		if (!fileList) continue;
// 		for (let i = 0; i < fileList.length; i++) {
// 			const file = fileList[i];
// 			if (file) {
// 				destroyTasks.push(
// 					Promise.resolve(file.destroy()).catch(() => {
// 						// Prevent cleanup exceptions from hiding primary errors
// 					}),
// 				);
// 			}
// 		}
// 	}
// 	await Promise.all(destroyTasks);
// }

// // NOTE: There is intentionally no automatic cleanup hook here anymore.
// // Files (memory buffers or temp files on disk) are only removed when you
// // explicitly call `.destroy()` on an UploadFile instance yourself, e.g.:
// //
// //   req.file.destroy();
// //   req.files['avatar'][0].destroy();
// //   for (const f of req.files) f.destroy();
// //
// // This means YOU are responsible for calling destroy() once you're done
// // with an uploaded file (e.g. after moving/copying it to permanent
// // storage), or temp files on disk will accumulate. `abortParsing` inside
// // parseMultipart still cleans up automatically on validation/limit
// // errors, since those files were never successfully handed to you.
