export type {
	AsyncOriginFunction,
	CorsMiddleware,
	CorsOrigin,
	CustomOriginFunction,
	ICorsOptions,
	StaticOrigin,
} from "./types/cors.types.js";
export { createCors as cors } from "./corsMiddleware.js";
