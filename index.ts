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

export { cors } from "./subatom/core/pipeline/parser/cors.js";
export { json } from "./subatom/core/pipeline/parser/json.js";
export { raw } from "./subatom/core/pipeline/parser/raw.js";
export { serveStatic } from "./subatom/core/pipeline/parser/serveStatic.js";
export { text } from "./subatom/core/pipeline/parser/text.js";
export { urlencoded } from "./subatom/core/pipeline/parser/urlencoded.js";

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
