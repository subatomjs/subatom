import type { NextFunction } from "../../../types/framework/pipeline/INext.js";
import type { IFrameworkRequest } from "../../../types/framework/pipeline/IUploadFile.js";
import {
	BadRequestError,
	PayloadTooLargeError,
	UnprocessableEntityError,
} from "../../http/errors/Error.js";

/**
 * Register this LAST in your middleware chain (after all routes and other
 * middleware). Every `next(err)` call from single()/array()/fields()/
 * anyFiles()/none() ends up here.
 *
 * Without something like this wired in, an upload validation error
 * (bad MIME type, size limit, too many files, etc.) is thrown correctly
 * and cleaned up correctly by parseMultipart, but nothing ever writes a
 * response back to the client - so the request just hangs until the
 * client or a proxy times it out. That hang is what looks like an
 * "infinite loop" from the browser.
 */
export function fileUploadErrorHandler(
	err: unknown,
	req: IFrameworkRequest,
	res: any,
	next: NextFunction,
) {
	if (!err) return next();

	const status = statusFor(err);
	const message = (err as Error)?.message || "Internal server error";

	// Adjust this block to match whatever response API your framework
	// actually exposes. Two common shapes are handled below.
	if (res.raw && typeof res.raw.writeHead === "function") {
		// Wrapped-request style (matches getStream()/getHeaders() pattern
		// used elsewhere in this codebase)
		if (!res.raw.headersSent) {
			res.raw.writeHead(status, { "Content-Type": "application/json" });
			res.raw.end(JSON.stringify({ error: message }));
		}
		return;
	}

	if (typeof res.status === "function" && typeof res.json === "function") {
		// Express-like API
		res.status(status).json({ error: message });
		return;
	}

	if (typeof res.writeHead === "function") {
		// Raw node http.ServerResponse
		if (!res.headersSent) {
			res.writeHead(status, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: message }));
		}
		return;
	}

	// Last resort: rethrow so it doesn't fail completely silently
	throw err;
}

function statusFor(err: unknown): number {
	if (err instanceof PayloadTooLargeError) return 413;
	if (err instanceof UnprocessableEntityError) return 422;
	if (err instanceof BadRequestError) return 400;
	return 500;
}
