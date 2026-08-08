export * from "./subatom/core/framework-core/subatom/Subatom.js";
export * from "./subatom/core/router/Router.js";
export { configEnv, env } from "./subatom/engine/utils/env/env.js";
export { parseEnv } from "./subatom/engine/utils/env/parseEnv.js";

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

export { cors } from "./subatom/core/pipeline/framework/cors.js";
export { json } from "./subatom/core/pipeline/framework/json.js";
export { raw } from "./subatom/core/pipeline/framework/raw.js";
export { serveStatic } from "./subatom/core/pipeline/framework/serveStatic.js";
export { text } from "./subatom/core/pipeline/framework/text.js";
export { urlencoded } from "./subatom/core/pipeline/framework/urlencoded.js";
export type {
	SubatomConfig,
	SubatomUserConfig,
} from "./subatom/types/config/SubatomConfig.js";
//Types
export type * from "./subatom/types/framework/pipeline/IUploadFile.js";

export type * from "./subatom/types/framework/pipeline/IUploadFile.js";
