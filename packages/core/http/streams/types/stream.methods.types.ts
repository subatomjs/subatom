/**
 * @fileoverview share types of all methods of streams.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { TransformCallback } from "node:stream";
import type { StreamPipeOptions } from "./stream.types.js";

//! ================== File Stream Types =================== //

export interface FileStreamOptions {
	start?: number;
	end?: number;
	highWaterMark?: number;
}

export interface DownloadOptions extends SendFileOptions {
	filename?: string;
}

export interface SendFileOptions {
	root?: string;
	contentType?: string;
}

//! ================== Request Stream Types =================== //
export type TypeDataListener = (chunk: Buffer) => void;
export type TypeEndListener = () => void;
export interface IPipeOptions {
	end?: boolean;
}

//! ================== Response Stream Types =================== //
export type TypeResEndCallback = () => void;
export type TypeResWriteCallback = (error?: Error | null) => void;

export interface ISendStreamOptions {
	contentType?: string;
	contentLength?: number;
	statusCode?: number;
}

export interface IStreamOptions {
	onError?: (err: Error) => void;
}

//! ================== Composition Stream Types =================== //
export interface IPipeStreamOptions {
	end?: boolean;
}

export type TypeTransformFunction<T = unknown, _R = unknown> = (
	chunk: T,
	encoding: BufferEncoding,
	callback: TransformCallback,
) => void;

export interface StreamResponseOptions extends StreamPipeOptions {
	status?: number;
	contentType?: string;
	/** Set only when known ahead of time (e.g. from a file stat). Omit for chunked transfer. */
	contentLength?: number;
	headers?: Record<string, string>;
}
