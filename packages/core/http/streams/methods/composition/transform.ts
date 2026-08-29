/**
 * @fileoverview PCreates a customized Node.js Transform stream via higher-order function constructor.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import {
	Transform as NodeTransform,
	type TransformOptions as NodeTransformOptions,
	type TransformCallback,
} from "node:stream";
import type { TypeTransformFunction } from "../../types/stream.methods.types.js";

export function createTransform<T = unknown>(
	transformFn: TypeTransformFunction<T>,
	options?: NodeTransformOptions,
): NodeTransform {
	return new NodeTransform({
		...options,
		transform(chunk: T, encoding: BufferEncoding, callback: TransformCallback) {
			try {
				transformFn(chunk, encoding, callback);
			} catch (err) {
				callback(err instanceof Error ? err : new Error(String(err)));
			}
		},
	});
}

export { NodeTransform as Transform };
