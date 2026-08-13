import { Transform as NodeTransform, TransformOptions as NodeTransformOptions, TransformCallback } from "node:stream";

export type TransformFunction<T = unknown, R = unknown> = (
    chunk: T,
    encoding: BufferEncoding,
    callback: TransformCallback
) => void;

/**
 * Creates a customized Node.js Transform stream via higher-order function constructor.
 */
export function createTransform<T = unknown>(
    transformFn: TransformFunction<T>,
    options?: NodeTransformOptions
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