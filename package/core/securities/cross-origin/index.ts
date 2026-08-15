export type {
	AsyncOriginFunction,
	CorsMiddleware,
	CorsOrigin,
	CustomOriginFunction,
	ICorsOptions,
	StaticOrigin,
} from "../../../types/securities/ICors.js";
export { createCors as cors } from "./corsMiddleware.js";
