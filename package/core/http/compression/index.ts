import type {
	CompressionOptions,
	StaticPrecompressOptions,
} from "../../../types/http/ICompression.js";
import { SubatomCompression } from "./compressor.js";
import { createDynamicCompressionMiddleware } from "./dynamicMiddleware.js";
import { SubatomStaticPrecompress } from "./staticPrecompress.js";

export * from "../../../types/http/ICompression.js";
export { SubatomCompression } from "./compressor.js";
export { SubatomStaticPrecompress } from "./staticPrecompress.js";

export function createCompression(options?: CompressionOptions) {
	const engine = new SubatomCompression(options);
	return createDynamicCompressionMiddleware(engine);
}

export function serveStaticPrecompressed(options: StaticPrecompressOptions) {
	const handler = new SubatomStaticPrecompress(options);
	return handler.middleware();
}
