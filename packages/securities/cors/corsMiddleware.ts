import type {
	CorsMiddleware,
	FallbackRequest,
	ICorsOptions,
} from "./types/cors.types.js";
import { normalizeHeaderValue, resolveOrigin } from "./cors.utils.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../pipelines/next/types/nextFunction.types.js";

const DEFAULT_OPTIONS: ICorsOptions = {
	origin: "*",
	methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
	allowedHeaders: [],
	exposedHeaders: [],
	credentials: false,
	optionsSuccessStatus: 204,
	preflightContinue: false,
};

export function createCors(options: ICorsOptions = {}): CorsMiddleware {
	const opts: ICorsOptions = { ...DEFAULT_OPTIONS, ...options };

	return async (
		req: IRequest,
		res: IResponse,
		next: NextFunction,
	): Promise<void> => {
		const fallbackReq = req as unknown as FallbackRequest;

		const rawOrigin = req.raw?.headers?.origin ?? fallbackReq.headers?.origin;
		const requestOrigin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

		const rawMethod = req.raw?.method ?? fallbackReq.method ?? "GET";
		const method = rawMethod.toUpperCase();

		// Use native res.vary() provided by IResponse contract
		if (requestOrigin) {
			res.vary("Origin");
		}

		if (!requestOrigin) {
			await next();
			return;
		}

		// 1. Resolve Origin
		const allowedOrigin = await resolveOrigin(requestOrigin, opts.origin);

		if (allowedOrigin) {
			if (allowedOrigin === "*") {
				// Spec restriction: Cannot use '*' when credentials are true
				if (opts.credentials) {
					res.setHeader("Access-Control-Allow-Origin", requestOrigin);
				} else {
					res.setHeader("Access-Control-Allow-Origin", "*");
				}
			} else if (typeof allowedOrigin === "string") {
				res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
			} else if (allowedOrigin === true) {
				res.setHeader("Access-Control-Allow-Origin", requestOrigin);
			}
		}

		// 2. Credentials
		if (opts.credentials === true) {
			res.setHeader("Access-Control-Allow-Credentials", "true");
		}

		// 3. Exposed Headers
		if (opts.exposedHeaders) {
			const exposed = normalizeHeaderValue(opts.exposedHeaders);
			if (exposed) {
				res.setHeader("Access-Control-Expose-Headers", exposed);
			}
		}

		// 4. Preflight Request Handler
		if (method === "OPTIONS") {
			// Allowed Methods
			if (opts.methods) {
				res.setHeader(
					"Access-Control-Allow-Methods",
					normalizeHeaderValue(opts.methods),
				);
			}

			// Allowed Headers
			const rawReqHeaders =
				req.raw?.headers?.["access-control-request-headers"] ??
				fallbackReq.headers?.["access-control-request-headers"];

			const requestHeaders = Array.isArray(rawReqHeaders)
				? rawReqHeaders.join(", ")
				: rawReqHeaders;

			const hasCustomAllowedHeaders = Array.isArray(opts.allowedHeaders)
				? opts.allowedHeaders.length > 0
				: Boolean(opts.allowedHeaders);

			if (hasCustomAllowedHeaders) {
				res.setHeader(
					"Access-Control-Allow-Headers",
					normalizeHeaderValue(opts.allowedHeaders),
				);
			} else if (requestHeaders) {
				res.setHeader("Access-Control-Allow-Headers", requestHeaders);
				res.vary("Access-Control-Request-Headers");
			}

			// Max Age
			if (typeof opts.maxAge === "number" && opts.maxAge >= 0) {
				res.setHeader("Access-Control-Max-Age", opts.maxAge.toString());
			}

			if (opts.preflightContinue) {
				await next();
			} else {
				res.status(opts.optionsSuccessStatus ?? 204);
				res.end();
			}
			return;
		}

		await next();
	};
}
