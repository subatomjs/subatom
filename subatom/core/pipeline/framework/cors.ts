// middleware/cors.ts

import type { NextFunction } from "../../../types/framework/pipeline/INext.js";
import type {
	ICorsOptions,
	TCorsOriginFunction,
} from "../../../types/framework/pipeline/IPipeline.js";
import type { IRequest } from "../../../types/http/IRequest.js";
import type { IResponse } from "../../../types/http/IResponse.js";

const defaultOptions: ICorsOptions = {
	origin: "*",
	methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
	allowedHeaders: ["Content-Type", "Authorization"],
	optionsSuccessStatus: 204,
};

function normalizeHeaderValue(val?: string | string[]): string {
	if (Array.isArray(val)) return val.join(",");
	return val || "";
}

export function cors(options: ICorsOptions = {}) {
	const opts = { ...defaultOptions, ...options };

	return async (req: IRequest, res: IResponse, next: NextFunction) => {
		const requestOrigin = req.raw.headers["origin"] as string | undefined;

		// 1. Determine Access-Control-Allow-Origin value
		let allowOrigin: string | undefined;

		if (opts.origin === "*") {
			allowOrigin = "*";
		} else if (typeof opts.origin === "boolean") {
			allowOrigin = opts.origin ? requestOrigin || "*" : undefined;
		} else if (typeof opts.origin === "string") {
			allowOrigin = opts.origin;
		} else if (Array.isArray(opts.origin)) {
			if (requestOrigin && opts.origin.includes(requestOrigin)) {
				allowOrigin = requestOrigin;
			}
		} else if (typeof opts.origin === "function") {
			const originFn: TCorsOriginFunction = opts.origin;

			await new Promise<void>((resolve) => {
				originFn(requestOrigin, (err, allow) => {
					if (!err && allow) {
						allowOrigin = requestOrigin;
					}
					resolve();
				});
			});
		}

		// 2. Set Access-Control-Allow-Origin & Vary header
		if (allowOrigin) {
			res.setHeader("Access-Control-Allow-Origin", allowOrigin);
			if (allowOrigin !== "*") {
				res.setHeader("Vary", "Origin");
			}
		}

		// 3. Set Access-Control-Allow-Credentials
		if (opts.credentials === true) {
			res.setHeader("Access-Control-Allow-Credentials", "true");
		}

		// 4. Set Access-Control-Expose-Headers
		if (opts.exposedHeaders) {
			const exposed = normalizeHeaderValue(opts.exposedHeaders);
			if (exposed) res.setHeader("Access-Control-Expose-Headers", exposed);
		}

		// 5. Handle Preflight OPTIONS requests
		const httpMethod = (req.raw.method || req.method || "GET").toUpperCase();
		const isOptionsRequest = httpMethod === "OPTIONS";

		if (isOptionsRequest) {
			// Set Allowed Methods
			if (opts.methods) {
				res.setHeader(
					"Access-Control-Allow-Methods",
					normalizeHeaderValue(opts.methods),
				);
			}

			// Set Allowed Headers
			const requestHeaders = req.raw.headers[
				"access-control-request-headers"
			] as string | undefined;
			if (opts.allowedHeaders) {
				res.setHeader(
					"Access-Control-Allow-Headers",
					normalizeHeaderValue(opts.allowedHeaders),
				);
			} else if (requestHeaders) {
				res.setHeader("Access-Control-Allow-Headers", requestHeaders);
			}

			// Set Max Age
			if (typeof opts.maxAge === "number") {
				res.setHeader("Access-Control-Max-Age", opts.maxAge.toString());
			}

			// Preflight responses return immediately without reaching downstream route handlers
			res.status(opts.optionsSuccessStatus ?? 204).end();
			return;
		}

		// 6. Pass control to next middleware or route handler for standard requests
		await next();
	};
}
