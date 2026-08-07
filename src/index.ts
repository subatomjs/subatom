export { configEnv, env, parseEnv } from "./config/env.js";
export * from "./lib/Router.js";
export * from "./lib/Subatom.js";
// --- Middleware Functions (Individual Named Exports) ---
export {
	array,
	fields,
	single,
} from "./modules/file_upload/fileUploadMiddleware.js";
export type { UploadFileOptions } from "./modules/file_upload/UploadFile.js";
//! --- Core Upload Class & Options ---
export { UploadFile } from "./modules/file_upload/UploadFile.js";
export { cors } from "./modules/middleware/cors.js";
// middleware
export { json } from "./modules/middleware/json.js";
export { serveStatic } from "./modules/middleware/serveStatic.js";
export { urlencoded } from "./modules/middleware/urlencoded.js";

// --- Grouped Middleware Object Export ---
import {
	array,
	fields,
	single,
} from "./modules/file_upload/fileUploadMiddleware.js";

export const file = {
	single,
	array,
	fields,
};

// Export config
export { defineConfig } from "./config/load-config.js";
export type { SubatomConfig, SubatomUserConfig } from "./config/types.js";
// --- Framework Types & Type Definitions ---
// --- Parser & Configuration Types ---
export type {
	FileMiddlewareOptions,
	FileParserConfig,
	FilesMap,
	FrameworkRequest,
	Middleware,
	NextFunction,
	RequestFiles,
	StorageStrategy,
} from "./types/file_upload/TypeUploadFile.js";
