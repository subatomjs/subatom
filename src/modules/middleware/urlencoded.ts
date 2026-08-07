// middleware/urlencoded.ts
import querystring from "node:querystring"; // Or: import querystring from "node:querystring";
import { parseLimit } from "../../utils/parseLimit.js";
import type { Request } from "../http/Request.js";
import type { Response as SubatomResponse } from "../http/Response.js";

export interface UrlencodedOptions {
	limit?: string | number;
}

export function urlencoded(options: UrlencodedOptions = {}) {
	const maxBytes = parseLimit(options.limit ?? "100kb"); // Default 100kb limit

	return async (
		req: Request<any, any, any, any>,
		res: SubatomResponse,
		next: () => void | Promise<void>,
	) => {
		const contentType = req.raw.headers["content-type"] || "";
		const hasBody =
			req.raw.headers["content-length"] || req.raw.headers["transfer-encoding"];

		// 1. Only process application/x-www-form-urlencoded requests
		if (
			!hasBody ||
			!contentType.includes("application/x-www-form-urlencoded")
		) {
			return next();
		}

		// 2. Content-Length header guard check
		const contentLength = parseInt(
			req.raw.headers["content-length"] || "0",
			10,
		);
		if (contentLength > maxBytes) {
			res.status(413).json({
				success: false,
				message: "Payload Too Large",
			});
			return;
		}

		// 3. Aggregate request stream chunks and enforce size limits dynamically
		try {
			const chunks: Buffer[] = [];
			let totalBytes = 0;

			for await (const chunk of req.raw) {
				totalBytes += chunk.length;

				if (totalBytes > maxBytes) {
					res.status(413).json({
						success: false,
						message: "Payload Too Large",
					});
					return;
				}

				chunks.push(chunk);
			}

			// 4. Decode form string payload into a JavaScript Object
			const rawBody = Buffer.concat(chunks).toString("utf-8");

			if (rawBody.trim().length > 0) {
				// Parse "name=Kunal&roles=admin&roles=dev" into { name: 'Kunal', roles: ['admin', 'dev'] }
				const parsedQuery = querystring.parse(rawBody);

				// Attach parsed result onto req.body
				req.body = { ...req.body, ...parsedQuery };
			} else if (!req.body) {
				req.body = {};
			}

			await next();
		} catch (error) {
			res.status(400).json({
				success: false,
				message: "Bad Request: Malformed URL-encoded payload",
			});
		}
	};
}
