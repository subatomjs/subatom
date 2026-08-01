export { configEnv, parseEnv } from "./config/env";

export * from "./lib/Subatom";
export * from "./lib/Router";

// middleware
export { json } from "./modules/middleware/json";
export { urlencoded } from "./modules/middleware/urlencoded";
export { cors } from "./modules/middleware/cors";
export { serveStatic } from "./modules/middleware/serveStatic";

//! --- Core Upload Class & Options ---
export { UploadFile } from "./modules/file_upload/UploadFile";
export type { UploadFileOptions } from "./modules/file_upload/UploadFile";

// --- Middleware Functions (Individual Named Exports) ---
export { single, array, fields } from "./modules/file_upload/fileUploadMiddleware";

// --- Grouped Middleware Object Export ---
import { single, array, fields } from "./modules/file_upload/fileUploadMiddleware";

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
} from "./types/file_upload/TypeUploadFile";

// --- Parser & Configuration Types ---
export type { FileParserConfig } from "./types/file_upload/TypeUploadFile";