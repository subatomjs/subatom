/**
 * @fileoverview Export hub of cors middleware.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */


export type {
	AsyncOriginFunction,
	CorsMiddleware,
	CorsOrigin,
	CustomOriginFunction,
	ICorsOptions,
	StaticOrigin,
} from "./types/cors.types.js";
export { createCors as cors } from "./corsMiddleware.js";
