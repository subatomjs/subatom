/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * @fileoverview
 * parseMultipart is an asynchronous multipart/form-data parsing engine built on Busboy
 * that extracts form fields and processes file uploads into memory buffers
 * or disk storage based on configuration. It enforces MIME type and size limits during streaming,
 * resolves accurate MIME types for generic application/octet-stream uploads, coerces primitive
 * multipart form fields, and prevents connection hangs by properly unpiping and draining incoming streams.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import busboy from "busboy";
import type {
	Destroyable,
	FileParserConfig,
	ParseResult,
} from "./types/files.types.js";
import {
	BadRequestError,
	PayloadTooLargeError,
	UnprocessableEntityError,
} from "../../errors/Errors.js";
import { FileUpload } from "./FileUpload.js";

const EXTENSION_TO_MIME: Record<string, string> = {
	svg: "image/svg+xml",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	bmp: "image/bmp",
	ico: "image/x-icon",
	tiff: "image/tiff",
	tif: "image/tiff",
	avif: "image/avif",
	pdf: "application/pdf",
	json: "application/json",
	txt: "text/plain",
	csv: "text/csv",
	xml: "application/xml",
	zip: "application/zip",
	tar: "application/x-tar",
	gz: "application/gzip",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	mp4: "video/mp4",
	webm: "video/webm",
};

/**
 * Resolves the true MIME type, falling back to extension-based lookup
 * if the client sent generic "application/octet-stream" or an empty string.
 */
function resolveMimeType(rawMime: string, filename: string): string {
	const normalized = (rawMime || "").trim().toLowerCase();
	const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
	const mapped = EXTENSION_TO_MIME[ext];

	if (
		(!normalized ||
			normalized === "application/octet-stream" ||
			normalized === "binary/octet-stream") &&
		mapped
	) {
		return mapped;
	}

	if (normalized === "image/svg") {
		return "image/svg+xml";
	}

	return normalized || mapped || "application/octet-stream";
}

/**
 * Matches a detected MIME type against allowed MIME rules, supporting wildcards (e.g. "image/*", "*\/*")
 * and fallback resolution based on file extensions.
 */
function isMimeAllowed(
	resolvedMime: string,
	filename: string,
	allowedTypes: string[],
): boolean {
	const targetMime = resolveMimeType(resolvedMime, filename);
	const ext = path.extname(filename).toLowerCase().replace(/^\./, "");

	for (const rule of allowedTypes) {
		const target = rule.trim().toLowerCase();

		if (target === "*/*" || target === "*") {
			return true;
		}

		if (target.endsWith("/*")) {
			const prefix = target.slice(0, -1);
			if (targetMime.startsWith(prefix)) {
				return true;
			}
			continue;
		}

		if (targetMime === target) {
			return true;
		}

		// SVG aliasing support
		if (
			(target === "image/svg" || target === "image/svg+xml") &&
			(targetMime === "image/svg" || targetMime === "image/svg+xml")
		) {
			return true;
		}

		// File extension match
		if (target.replace(/^\./, "") === ext) {
			return true;
		}
	}

	return false;
}

/**
 * Coerces multipart string values into primitives (numbers, booleans, JSON objects/arrays).
 */
function coerceFieldValue(value: string): unknown {
	const trimmed = value.trim();

	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (trimmed === "null") return null;

	if (
		/^-?\d+(\.\d+)?$/.test(trimmed) &&
		!(
			trimmed.length > 1 &&
			trimmed.startsWith("0") &&
			!trimmed.startsWith("0.")
		)
	) {
		const num = Number(trimmed);
		if (Number.isFinite(num)) {
			return num;
		}
	}

	if (
		(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
		(trimmed.startsWith("[") && trimmed.endsWith("]"))
	) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return value;
		}
	}

	return value;
}

export async function parseMultipart(
	stream: Readable,
	headers: IncomingHttpHeaders,
	config: FileParserConfig,
): Promise<ParseResult> {
	// 1. Ensure upload destination directory exists for disk strategy.
	let targetDir = os.tmpdir();
	if (config.storage === "disk" && config.dest) {
		targetDir = config.dest;
		try {
			await fs.promises.mkdir(targetDir, { recursive: true });
		} catch (mkdirErr: unknown) {
			throw new BadRequestError(
				`Failed to create upload directory '${targetDir}': ${(mkdirErr as Error).message}`,
			);
		}
	}

	return new Promise((resolve, reject) => {
		// 2. Safely initialize Busboy
		let bb: busboy.Busboy;
		try {
			bb = busboy({ headers, limits: config.limits });
		} catch (err: unknown) {
			return reject(
				new BadRequestError(
					`Invalid multipart form headers: ${(err as Error).message}`,
				),
			);
		}

		const body: Record<string, unknown> = {};
		const files: Record<string, FileUpload[]> = Object.create(null);
		const pendingWrites: Promise<FileUpload | null>[] = [];
		const tempFilePaths: string[] = [];
		const activeHandles: Set<Destroyable> = new Set();
		let isFinishedOrAborted = false;

		const cleanupTempFiles = async () => {
			await Promise.all(
				tempFilePaths.map((filePath) =>
					fs.promises.unlink(filePath).catch(() => {}),
				),
			);
		};

		const abortParsing = (err: Error) => {
			if (isFinishedOrAborted) return;
			isFinishedOrAborted = true;

			try {
				stream.unpipe(bb);
				stream.resume();
			} catch {
				// Ignore unpipe errors
			}

			for (const handle of activeHandles) {
				try {
					handle.destroy(err);
				} catch {
					// Ignore teardown errors
				}
			}
			activeHandles.clear();

			cleanupTempFiles().finally(() => {
				reject(err);
			});
		};

		// 3. Handle Text Fields
		bb.on("field", (fieldname, val) => {
			if (isFinishedOrAborted) return;
			const parsedVal = coerceFieldValue(val);

			if (fieldname in body) {
				const current = body[fieldname];
				if (Array.isArray(current)) {
					current.push(parsedVal);
				} else {
					body[fieldname] = [current, parsedVal];
				}
			} else {
				body[fieldname] = parsedVal;
			}
		});

		// 4. Handle Incoming Files
		bb.on("file", (fieldname, fileStream, info) => {
			if (isFinishedOrAborted) {
				fileStream.resume();
				return;
			}

			const { filename, encoding, mimeType } = info;

			if (!filename) {
				fileStream.resume();
				return;
			}

			// Infer exact MIME type if client passed application/octet-stream
			const effectiveMime = resolveMimeType(mimeType, filename);

			// MIME Type Validation against configured middleware constraints
			if (
				config.allowedMimeTypes?.length &&
				!isMimeAllowed(effectiveMime, filename, config.allowedMimeTypes)
			) {
				fileStream.resume();
				return abortParsing(
					new UnprocessableEntityError(
						`File MIME type '${mimeType}' is not allowed for field '${fieldname}', only ${config.allowedMimeTypes.join(", ")} are allowed`,
					),
				);
			}

			// -------------------------------------------------------------
			// STORAGE STRATEGY A: Memory
			// -------------------------------------------------------------
			if (config.storage === "memory") {
				const chunks: Buffer[] = [];
				activeHandles.add(fileStream as unknown as Destroyable);

				const promise = new Promise<FileUpload | null>((res, rej) => {
					fileStream.on("data", (chunk: Buffer) => {
						if (!isFinishedOrAborted) chunks.push(chunk);
					});

					fileStream.on("limit", () => {
						fileStream.resume();
						rej(
							new PayloadTooLargeError(
								`File size limit exceeded for field '${fieldname}'`,
							),
						);
					});

					fileStream.on("end", () => {
						activeHandles.delete(fileStream as unknown as Destroyable);
						if (isFinishedOrAborted || fileStream.truncated) {
							return res(null);
						}
						const buffer = Buffer.concat(chunks);
						res(
							new FileUpload({
								filename,
								encoding,
								mimetype: effectiveMime,
								storageType: "memory",
								size: buffer.length,
								buffer,
							}),
						);
					});

					fileStream.on("close", () => {
						activeHandles.delete(fileStream as unknown as Destroyable);
					});

					fileStream.on("error", (streamErr) => {
						activeHandles.delete(fileStream as unknown as Destroyable);
						rej(
							new BadRequestError(
								`File stream error on field '${fieldname}': ${streamErr.message}`,
							),
						);
					});
				});

				promise
					.then((upload) => {
						if (upload && !isFinishedOrAborted) {
							appendFile(files, fieldname, upload);
						}
					})
					.catch(abortParsing);

				pendingWrites.push(promise);
			}
			// -------------------------------------------------------------
			// STORAGE STRATEGY B: Disk
			// -------------------------------------------------------------
			else {
				const tempName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${path.basename(filename)}`;
				const savePath = path.join(targetDir, tempName);
				tempFilePaths.push(savePath);

				const outStream = fs.createWriteStream(savePath);
				activeHandles.add(outStream);
				activeHandles.add(fileStream as unknown as Destroyable);

				const promise = new Promise<FileUpload | null>((res, rej) => {
					fileStream.pipe(outStream);

					fileStream.on("limit", () => {
						outStream.destroy();
						fs.promises.unlink(savePath).catch(() => {});
						rej(
							new PayloadTooLargeError(
								`File size limit exceeded for field '${fieldname}'`,
							),
						);
					});

					outStream.on("finish", () => {
						activeHandles.delete(outStream);
						activeHandles.delete(fileStream as unknown as Destroyable);
						if (isFinishedOrAborted || fileStream.truncated) {
							return res(null);
						}
						res(
							new FileUpload({
								filename,
								encoding,
								mimetype: effectiveMime,
								storageType: "disk",
								path: savePath,
								size: outStream.bytesWritten,
							}),
						);
					});

					outStream.on("close", () => {
						activeHandles.delete(outStream);
					});

					outStream.on("error", (err) => {
						activeHandles.delete(outStream);
						fs.promises.unlink(savePath).catch(() => {});
						rej(
							new BadRequestError(
								`Disk write error for field '${fieldname}': ${err.message}`,
							),
						);
					});

					fileStream.on("error", (err) => {
						activeHandles.delete(fileStream as unknown as Destroyable);
						outStream.destroy();
						fs.promises.unlink(savePath).catch(() => {});
						rej(
							new BadRequestError(
								`File stream error for field '${fieldname}': ${err.message}`,
							),
						);
					});

					fileStream.on("close", () => {
						activeHandles.delete(fileStream as unknown as Destroyable);
					});
				});

				promise
					.then((upload) => {
						if (upload && !isFinishedOrAborted) {
							appendFile(files, fieldname, upload);
						}
					})
					.catch(abortParsing);

				pendingWrites.push(promise);
			}
		});

		// 5. Limits & Errors
		bb.on("partsLimit", () =>
			abortParsing(new PayloadTooLargeError("Multipart parts limit exceeded")),
		);
		bb.on("filesLimit", () =>
			abortParsing(new PayloadTooLargeError("Multipart files limit exceeded")),
		);
		bb.on("fieldsLimit", () =>
			abortParsing(new PayloadTooLargeError("Multipart fields limit exceeded")),
		);

		bb.on("error", (err: Error) => {
			if (!isFinishedOrAborted) {
				abortParsing(
					new BadRequestError(`Multipart parsing error: ${err.message}`),
				);
			}
		});

		stream.on("aborted", () => {
			abortParsing(new BadRequestError("Client aborted the upload"));
		});
		stream.on("error", (err: Error) => {
			abortParsing(new BadRequestError(`Request stream error: ${err.message}`));
		});

		// 6. Completion
		bb.on("finish", async () => {
			if (isFinishedOrAborted) return;
			try {
				await Promise.all(pendingWrites);
				if (!isFinishedOrAborted) {
					isFinishedOrAborted = true;
					resolve({ body, files });
				}
			} catch (err: unknown) {
				abortParsing(err as Error);
			}
		});

		stream.pipe(bb);
	});
}

function appendFile(
	files: Record<string, FileUpload[]>,
	fieldname: string,
	upload: FileUpload,
): void {
	if (!files[fieldname]) {
		files[fieldname] = [upload];
	} else {
		files[fieldname].push(upload);
	}
}
