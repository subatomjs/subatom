import {
	PassThrough as NodePassThrough,
	type TransformOptions,
} from "node:stream";

/**
 * Factory for creating a PassThrough stream (used for monitoring or duplication).
 */
export function createPassThrough(options?: TransformOptions): NodePassThrough {
	return new NodePassThrough(options);
}

export { NodePassThrough as PassThrough };
