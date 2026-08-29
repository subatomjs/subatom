/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * This module is responsible for dynamically generating and attaching all standard
 * HTTP status helper methods to a shared prototype at module load time, providing a
 * unified and standardized API for sending JSON HTTP responses.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */

import type { IResponse, IResponseHelper } from "../types/response.types.js";
import { HTTP_STATUS_REGISTRY } from "../services/helpers.service.js";

class ResponseHelperImpl {
	constructor(public readonly res: IResponse) {}
}

// Build all methods onto the shared prototype
for (const entry of HTTP_STATUS_REGISTRY.values()) {
	(ResponseHelperImpl.prototype as any)[entry.message] = entry.isError
		? function (
				this: ResponseHelperImpl,
				messageOrError?: string | Error,
				details?: unknown,
			) {
				const message =
					messageOrError instanceof Error
						? messageOrError.message
						: (messageOrError ?? entry.defaultMessage);

				return this.res.status(entry.code).json({
					success: false,
					message,
					...(details !== undefined ? { details } : {}),
				});
			}
		: function (this: ResponseHelperImpl, data?: unknown) {
				return this.res.status(entry.code).json({
					success: true,
					data,
				});
			};
}

export const ResponseHelper = ResponseHelperImpl as unknown as new (
	res: IResponse,
) => IResponseHelper;

export type ResponseHelper = IResponseHelper;
