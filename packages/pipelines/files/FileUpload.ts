/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * @fileoverview
  FileUpload serves as a unified abstraction layer for uploaded file handling across both memory- and 
  disk-backed storage mechanisms. It encapsulates essential file metadata—such as filename,
  encoding, MIME type, size, and location—while providing a consistent API to consume
  file content as either a readable stream or a raw buffer regardless of how the payload is persisted. 
  Additionally, it manages the complete resource lifecycle by facilitating garbage collection of in-memory
  buffers and unlinking temporary disk files via its cleanup routine, while supporting cross-realm 
  runtime type evaluation through custom instance validation.
 */

import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import { Readable } from "node:stream";
import type {
	IFileUpload,
	FileUploadOptions,
	StorageStrategy,
} from "./types/files.types.js";

export class FileUpload implements IFileUpload {
	public readonly _isUploadFile = true;
	public readonly filename: string;
	public readonly encoding: string;
	public readonly mimetype: string;
	public readonly storageType: StorageStrategy;
	public readonly path: string | undefined;
	public readonly size: number | undefined;
	private _buffer: Buffer | undefined;
	private _destroyed = false;

	constructor(options: FileUploadOptions) {
		this.filename = options.filename;
		this.encoding = options.encoding;
		this.mimetype = options.mimetype;
		this.storageType = options.storageType;
		this._buffer = options.buffer;
		this.path = options.path;
		this.size = options.size;
	}

	// Cross-realm and custom instanceof support using strict type predicate
	public static [Symbol.hasInstance](
		instance: unknown,
	): instance is IFileUpload {
		if (!instance || typeof instance !== "object") {
			return false;
		}

		const candidate = instance as Record<string, unknown>;

		return (
			candidate._isUploadFile === true ||
			(typeof candidate.filename === "string" &&
				typeof candidate.stream === "function" &&
				typeof candidate.buffer === "function" &&
				typeof candidate.destroy === "function")
		);
	}

	public get destroyed(): boolean {
		return this._destroyed;
	}

	public get bufferContent(): Buffer | undefined {
		return this._buffer;
	}

	public async buffer(): Promise<Buffer> {
		if (this._destroyed) {
			throw new Error("Cannot access buffer of destroyed UploadFile.");
		}
		if (this.storageType === "memory" && this._buffer) {
			return this._buffer;
		}
		if (this.path) {
			return fsPromises.readFile(this.path);
		}
		throw new Error("File content unavailable.");
	}

	public stream(): Readable {
		if (this._destroyed) {
			throw new Error("Cannot create stream for destroyed UploadFile.");
		}
		if (this.storageType === "memory" && this._buffer) {
			return Readable.from(this._buffer);
		}
		if (this.path) {
			return fs.createReadStream(this.path);
		}
		throw new Error("File stream unavailable.");
	}

	public toJSON() {
		return {
			filename: this.filename,
			encoding: this.encoding,
			mimetype: this.mimetype,
			storageType: this.storageType,
			size: this.size,
			path: this.path,
		};
	}

	public async destroy(): Promise<void> {
		if (this._destroyed) return;
		this._destroyed = true;

		if (this.storageType === "disk" && this.path) {
			try {
				await fsPromises.unlink(this.path);
			} catch {
				// Silently swallow missing file errors during cleanup
			}
		}
		this._buffer = undefined;
	}
}
