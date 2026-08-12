export { createCors as cors } from "./corsMiddleware.js";
export type {
	ICorsOptions,
	CorsOrigin,
	StaticOrigin,
	CustomOriginFunction,
	AsyncOriginFunction,
	CorsMiddleware,
} from "../../../types/security/ICors.js";