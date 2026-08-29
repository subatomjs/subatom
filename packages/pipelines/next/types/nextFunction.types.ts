/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * The `next` callback passed to every middleware/route handler. Calling it
 * with no argument advances the pipeline to the following handler; calling
 * it with an error short-circuits into the error-handling boundary (the
 * error propagates by throwing, caught by whichever `try/catch` is driving
 * the pipeline — see `Next.next` / `Router.dispatch`).
 */
export type NextFunction = (err?: unknown) => void | Promise<void>;

/**
 * The public contract for a pipeline runner: something that executes an
 * ordered list of handlers against a single (req, res) pair and exposes
 * the bound `next` callback those handlers call to advance. Type against
 * this rather than the concrete `Next` class if you need to accept or
 * construct a runner generically.
 */
export interface INext {
	/** The bound `next(err?)` callback — safe to pass directly to a handler. */
	readonly next: NextFunction;
	/** Starts (or resumes) the pipeline from its current position. */
	run(): Promise<void>;
}
