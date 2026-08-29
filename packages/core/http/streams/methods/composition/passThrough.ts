/**
 * @fileoverview Factory for creating a PassThrough stream (used for monitoring or duplication).
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import {
	PassThrough as NodePassThrough,
	type TransformOptions,
} from "node:stream";

export function createPassThrough(options?: TransformOptions): NodePassThrough {
	return new NodePassThrough(options);
}

export { NodePassThrough as PassThrough };
