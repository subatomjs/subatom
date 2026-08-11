export * from "./subatom/core/bootstrap/subatom/Subatom.js";
export * from "./subatom/core/router/Router.js";
export { configEnv, env } from "./subatom/cli-engine/utils/env/env.js";
export { parseEnv } from "./subatom/cli-engine/utils/env/parseEnv.js";

// --- Middleware Functions (Individual Named Exports) ---
import {
  array,
  fields,
  single,
} from "./subatom/core/pipeline/file-system/fileUploadPipe.js";

export const file = {
  single,
  array,
  fields,
};

// Export config
export { defineConfig } from "./subatom/config/load.config.js";
export { UploadFile } from "./subatom/core/pipeline/file-system/UploadFile.js";

export { cors } from "./subatom/core/factory-functions/cors.js";
export { json } from "./subatom/core/factory-functions/json.js";
export { raw } from "./subatom/core/factory-functions/raw.js";
export { serveStatic } from "./subatom/core/factory-functions/serveStatic.js";
export { text } from "./subatom/core/factory-functions/text.js";
export { urlencoded } from "./subatom/core/factory-functions/urlencoded.js";
export { session } from "./subatom/core/factory-functions/session.js";

//Types
export type {
  SubatomConfig,
  SubatomUserConfig,
} from "./subatom/types/config/SubatomConfig.js";


export type {
  IRequest,
  RequestOptions,
  RequestFiles,
} from "./subatom/types/http/IRequest.js";
export type {
  IResponse,
  CookieOptions,
  SendFileOptions,
  DownloadOptions,
} from "./subatom/types/http/IResponse.js";

export type {
  NextFunction,
  INext,
} from "./subatom/types/framework/pipeline/INext.js";

export type {
  UploadFileOptions,
  Middleware,
  IUploadFile,
  FilesMap,
} from "./subatom/types/framework/pipeline/IUploadFile.js";


// export streams with types
export * from './subatom/core/http/streams/index.js';
export * from './subatom/core/websocket/sse/index.js'


//
export * from './subatom/core/http/compression/compression.js'
export * from "./subatom/core/http/compression//staticPrecompress.js"

