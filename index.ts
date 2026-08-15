export * from "./package/core/bootstrap/subatom/Subatom.js";
export * from "./package/core/router/Router.js";
export { configEnv, env } from "./package/config/env/env.js";
export { parseEnv } from "./package/config/env/parseEnv.js";

// --- Middleware Functions (Individual Named Exports) ---
import {
  array,
  fields,
  single,
} from "./package/core/pipeline/file-system/fileUploadPipe.js";

export const file = {
  single,
  array,
  fields,
};

// Export config
export { defineConfig } from "./package/config/load.config.js";
export { UploadFile } from "./package/core/pipeline/file-system/UploadFile.js";

export { cors } from "./package/core/securities/cross-origin/index.js";
export * from "./package/core/securities/cross-origin/index.js";
export { json } from "./package/core/factory-functions/json.js";
export { raw } from "./package/core/factory-functions/raw.js";
export { serveStatic } from "./package/core/factory-functions/serveStatic.js";
export { text } from "./package/core/factory-functions/text.js";
export { urlencoded } from "./package/core/factory-functions/urlencoded.js";
export { session } from "./package/core/factory-functions/session.js";

//Types
export type {
  SubatomConfig,
  SubatomUserConfig,
} from "./package/types/config/SubatomConfig.js";

export type {
  IRequest,
  RequestOptions,
  RequestFiles,
} from "./package/types/http/IRequest.js";
export type {
  IResponse,
  CookieOptions,
  SendFileOptions,
  DownloadOptions,
} from "./package/types/http/IResponse.js";

export type {
  NextFunction,
  INext,
} from "./package/types/framework/pipeline/INext.js";

export type {
  UploadFileOptions,
  Middleware,
  IUploadFile,
  FilesMap,
} from "./package/types/framework/pipeline/IUploadFile.js";

// export streams with types
export * from "./package/core/http/streams/index.js";
export * from "./package/core/websocket/sse/index.js";

//
export * from "./package/core/http/compression/index.js";
export * from "./package/core/http/compression/staticPrecompress.js";

// Security
export * from "./package/core/securities/security/index.js";
export * from "./package/core/securities/rate-limits/index.js";


//Docs
export * from './package/core/docs/registerDocs.js'