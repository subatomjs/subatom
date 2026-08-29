/**
 * @fileoverview export hub of stream methods.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

// File streams
export { fileStream } from "./files/fileStream.js";
export { resDownload } from "./files/resDownload.js";
export { resSendFile } from "./files/resSendFile.js";

// Request streams
export { reqOnData } from "./request/reqOnData.js";
export { reqOnEnd } from "./request/reqOnEnd.js";
export { reqPipe } from "./request/reqPipe.js";
export { reqStream } from "./request/reqStream.js";

// Response Streams
export { resEnd } from "./response/resEnd.js";
export { resSendStream } from "./response/resSendStream.js";
export { resStream } from "./response/resStream.js";
export { resWrite } from "./response/resWrite.js";

// Composition
export { createPassThrough } from "./composition/passThrough.js";
export { pipe } from "./composition/pipe.js";
export { pipeline } from "./composition/pipeline.js";
export { createTransform } from "./composition/transform.js";

// Export all Types
export type {
	FileStreamOptions,
	SendFileOptions,
	DownloadOptions,
	TypeDataListener,
	TypeEndListener,
	IPipeOptions,
	TypeResEndCallback,
	TypeResWriteCallback,
	ISendStreamOptions,
	IStreamOptions,
	IPipeStreamOptions,
	TypeTransformFunction,
	StreamResponseOptions,
} from "../types/stream.methods.types.js";
