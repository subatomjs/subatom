import type {
	INext,
	NextFunction,
} from "../../../types/framework/pipeline/INext.js";
import type { IHandler } from "../../../types/framework/router/IRouter.js";
import type { IRequest } from "../../../types/http/IRequest.js";
import type { IResponse } from "../../../types/http/IResponse.js";

/**
 * Encapsulates sequential execution of a middleware/handler pipeline
 * against a single (req, res) pair.
 *
 * Extracted out of Router so "advance to the next handler" has exactly
 * one implementation, rather than being reimplemented as ad hoc closures
 * in multiple places — which is how SubatomServer previously grew a
 * second, subtly different (and buggy) copy of this same logic.
 *
 * Usage:
 *   const pipeline = new Next(handlers, req, res);
 *   await pipeline.run();
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
