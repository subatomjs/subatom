import type { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NextFunction } from "./INext.js";


export interface UploadFileOptions {
	filename: string;
	encoding: string;
	mimetype: string;
	storageType: "memory" | "disk";
	buffer?: Buffer;
	path?: string;
	size?: number;
}


export interface IUploadFile {
	readonly filename: string;
	readonly encoding: string;
	readonly mimetype: string;
	readonly storageType: "memory" | "disk";
	readonly path: string | undefined;
	readonly size: number | undefined;

	/** True once `destroy()` has been called; the file is no longer readable. */
	readonly destroyed: boolean;

	/** The in-memory buffer, if `storageType` is "memory". Undefined for disk-backed files. */
	readonly bufferContent: Buffer | undefined;

	/** Returns the file content as a Buffer, reading from disk if necessary. */
	buffer(): Promise<Buffer>;

	/** Returns a readable stream of the file content. */
	stream(): Readable;

	/** Frees the in-memory buffer and/or deletes the temp file on disk. */
	destroy(): Promise<void>;
}

export type FilesMap = Record<string, IUploadFile | IUploadFile[]>;



export type StorageStrategy = "memory" | "disk";

export interface FileParserConfig {
	storage: StorageStrategy;
	dest?: string;
	allowedMimeTypes?: string[];
	limits?: {
		fileSize?: number;
		files?: number;
		fields?: number;
		fieldSize?: number;
		parts?: number;
	};
}

export interface FileUploadPipelineOptions extends FileParserConfig {
	fieldname?: string;
}
export type RequestFiles = IUploadFile[] | FilesMap;

export interface IFrameworkRequest extends IncomingMessage {
	body?: Record<string, unknown>;
	file?: IUploadFile | undefined;
	files?: RequestFiles;
}

export type Middleware = (
	req: IFrameworkRequest,
	res: ServerResponse,
	next: NextFunction,
) => Promise<void> | void;
