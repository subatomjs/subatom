/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { IHandler } from "../../core/router/types/router.types.js";
import type { INext, NextFunction } from "./types/nextFunction.types.js";

/**
 * @fileoverview
 * Next function for middleware of subatom.
 * Usage:
 *   const pipeline = new Next(handlers, req, res);
 *   await pipeline.run();
 *   router.get(req, res, next)
 */
export class Next implements INext {
	private index = 0;
	private settled = false;

	constructor(
		private readonly handlers: readonly IHandler[],
		private readonly req: IRequest,
		private readonly res: IResponse,
	) {}

	/** Starts (or resumes) the pipeline from its current position. */
	public async run(): Promise<void> {
		await this.next();
	}

	/**
	 * The actual `next(err?)` callback handed to each handler. A class
	 * field arrow function, so it stays bound to this instance no matter
	 * how it's passed around.
	 */
	public next: NextFunction = async (err?: unknown): Promise<void> => {
		if (this.settled) {
			// Defensive: a handler called next() again after the pipeline
			// already finished/errored. Ignore rather than double-executing
			// or throwing into an already-closed response.
			console.warn(
				"[Subatom Warning]: next() was called after the request pipeline already settled; ignoring.",
			);
			return;
		}

		if (err) {
			this.settled = true;
			throw err;
		}

		if (this.res.writableEnded || this.index >= this.handlers.length) {
			this.settled = true;
			return;
		}

		const handler = this.handlers[this.index++];
		if (!handler) {
			return this.next();
		}

		try {
			// Promise.resolve catches both synchronous throws and async promise rejections.
			await Promise.resolve(handler(this.req, this.res, this.next));
		} catch (handlerError) {
			this.settled = true;
			throw handlerError; // Bubbles up to whoever awaited run().
		}
	};
}
