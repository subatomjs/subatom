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
 * prevents connection hangs by properly unpiping and draining incoming streams on
 * validation or network errors, and tracks active file descriptors and temporary paths
 * to guarantee immediate cleanup and resource reclamation upon abort.
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

export function parseMultipart(
	stream: Readable,
	headers: IncomingHttpHeaders,
	config: FileParserConfig,
): Promise<ParseResult> {
	return new Promise((resolve, reject) => {
		// 1. Ensure upload destination directory exists for disk strategy
		let targetDir = os.tmpdir();
		if (config.storage === "disk" && config.dest) {
			targetDir = config.dest || os.tmpdir();
			try {
				if (!fs.existsSync(targetDir)) {
					fs.mkdirSync(targetDir, { recursive: true });
				}
			} catch (mkdirErr: unknown) {
				return reject(
					new BadRequestError(
						`Failed to create upload directory '${targetDir}': ${(mkdirErr as Error).message}`,
					),
				);
			}
		}

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
		const tempFilePaths: string[] = []; // Track created temp files
		// track every open write/read handle so we can force-close the
		// the instant we abort, instead of leaving them dangling once the
		// upstream request stream is unpiped.
		const activeHandles: Set<Destroyable> = new Set();
		let isFinishedOrAborted = false;

		// Purge written temp files if an error occurs
		const cleanupTempFiles = async () => {
			await Promise.all(
				tempFilePaths.map((filePath) =>
					fs.promises.unlink(filePath).catch(() => {}),
				),
			);
		};

		// Safe Abort Function: Unpipes and drains streams WITHOUT destroying busboy
		const abortParsing = (err: Error) => {
			if (isFinishedOrAborted) return;
			isFinishedOrAborted = true;

			try {
				// Unpipe incoming HTTP request from busboy
				stream.unpipe(bb);
				// Resume incoming streams to consume remaining bytes without hanging TCP socket
				stream.resume();
			} catch {
				// Ignore unpipe errors
			}

			// force-close every in-flight file stream / write stream.
			// Without this, any file that was already being written when the
			// bad part arrived never gets a 'finish'/'end' event (because we
			// just cut off its data supply above), leaking open file
			// descriptors on every rejected upload until the process runs out
			// of them.
			for (const handle of activeHandles) {
				try {
					handle.destroy(err);
				} catch {
					// ignore - best effort teardown
				}
			}
			activeHandles.clear();

			cleanupTempFiles().finally(() => {
				reject(err);
			});
		};

		// 3. Handle Text Fields
		bb.on("field", (fieldname, val) => {
			if (isFinishedOrAborted) return; // NEW: stop processing after abort
			body[fieldname] = val;
		});

		// 4. Handle Incoming Files
		bb.on("file", (fieldname, fileStream, info) => {
			// if we've already aborted (e.g. an earlier part in this same
			// request failed validation), don't touch disk/memory for any
			// further parts. Busboy can have already-buffered events queued
			// up before unpipe() takes effect, so this guard has to be the
			// very first thing in the handler.
			if (isFinishedOrAborted) {
				fileStream.resume(); // drain so busboy doesn't stall internally
				return;
			}

			const { filename, encoding, mimeType } = info;

			// If user submitted an empty file input field
			if (!filename) {
				fileStream.resume();
				return;
			}

			// MIME Type Validation
			if (
				config.allowedMimeTypes?.length &&
				!config.allowedMimeTypes.includes(mimeType)
			) {
				// Resume file stream so busboy keeps flowing, then safely abort
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
								mimetype: mimeType,
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
								mimetype: mimeType,
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
			// Ignore busboy internal teardown errors if we already triggered an abort
			if (!isFinishedOrAborted) {
				abortParsing(
					new BadRequestError(`Multipart parsing error: ${err.message}`),
				);
			}
		});

		// if the underlying request itself dies mid-upload (client
		// disconnect, proxy timeout, etc.) we must abort the same way, or
		// pendingWrites will simply hang forever since bb's 'finish' event
		// will never fire and nothing will ever settle the outer promise.
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

		// Pipe HTTP stream into busboy
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
