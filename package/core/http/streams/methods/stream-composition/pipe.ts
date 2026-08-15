import type { Readable, Writable } from "node:stream";

export interface PipeStreamOptions {
	end?: boolean;
}

/**
 * Functional pipe helper supporting chainable piping.
 */
export function pipe<T extends Writable>(
	source: Readable,
	destination: T,
	options?: PipeStreamOptions,
): T {
	return source.pipe(destination, options);
}
