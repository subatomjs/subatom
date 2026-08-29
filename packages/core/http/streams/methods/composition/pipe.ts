/**
 * @fileoverview Functional pipe helper supporting chainable piping.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { Readable, Writable } from "node:stream";
import type { IPipeStreamOptions } from "../../types/stream.methods.types.js";

export function pipe<T extends Writable>(
	source: Readable,
	destination: T,
	options?: IPipeStreamOptions,
): T {
	return source.pipe(destination, options);
}
