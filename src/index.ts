export { configEnv, parseEnv } from "./config/env.js";

export * from "./lib/Subatom.js";
export * from "./lib/Router.js";

// middleware
export { json } from "./modules/middleware/json.js";
export { urlencoded } from "./modules/middleware/urlencoded.js";
export { cors } from "./modules/middleware/cors.js";
export { serveStatic } from "./modules/middleware/serveStatic.js";

//! --- Core Upload Class & Options ---
export { UploadFile } from "./modules/file_upload/UploadFile.js";
export type { UploadFileOptions } from "./modules/file_upload/UploadFile.js";

// --- Middleware Functions (Individual Named Exports) ---
export {
  single,
  array,
  fields,
} from "./modules/file_upload/fileUploadMiddleware.js";

// --- Grouped Middleware Object Export ---
import {
  single,
  array,
  fields,
} from "./modules/file_upload/fileUploadMiddleware.js";

export const file = {
  single,
  array,
  fields,
};

// --- Framework Types & Type Definitions ---
export type {
  FrameworkRequest,
  FileMiddlewareOptions,
  FilesMap,
  RequestFiles,
  StorageStrategy,
  Middleware,
  NextFunction,
} from "./types/file_upload/TypeUploadFile.js";

// --- Parser & Configuration Types ---
export type { FileParserConfig } from "./types/file_upload/TypeUploadFile.js";
