import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import { Readable } from "node:stream";

export interface UploadFileOptions {
	filename: string;
	encoding: string;
	mimetype: string;
	storageType: "memory" | "disk";
	buffer?: Buffer;
	path?: string;
	size?: number;
}

export class UploadFile {
	public readonly filename: string;
	public readonly encoding: string;
	public readonly mimetype: string;
	public readonly storageType: "memory" | "disk";
	public readonly path: string | undefined;
	public readonly size: number | undefined;
	private _buffer: Buffer | undefined;
	private _destroyed = false;

	constructor(options: UploadFileOptions) {
		this.filename = options.filename;
		this.encoding = options.encoding;
		this.mimetype = options.mimetype;
		this.storageType = options.storageType;
		this._buffer = options.buffer;
		this.path = options.path;
		this.size = options.size;
	}

	// Returns true if the file has been destroyed, false otherwise
	public get destroyed(): boolean {
		return this._destroyed;
	}

	// Returns the file content as a Buffer if stored in memory, otherwise undefined
	public get bufferContent(): Buffer | undefined {
		return this._buffer;
	}

	// Returns the file content as a Buffer. If the file is stored on disk, it reads the file from disk.
	public async buffer(): Promise<Buffer> {
		if (this._destroyed)
			throw new Error("Cannot access buffer of destroyed UploadFile.");
		if (this.storageType === "memory" && this._buffer) {
			return this._buffer;
		}
		if (this.path) {
			return fsPromises.readFile(this.path);
		}
		throw new Error("File content unavailable.");
	}

	// Returns a readable stream of the file content
	public stream(): Readable {
		if (this._destroyed)
			throw new Error("Cannot create stream for destroyed UploadFile.");
		if (this.storageType === "memory" && this._buffer) {
			return Readable.from(this._buffer);
		}
		if (this.path) {
			return fs.createReadStream(this.path);
		}
		throw new Error("File stream unavailable.");
	}

	// Destroy after processing to free up memory or disk space
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
