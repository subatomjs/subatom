/**
 * @fileoverview Defines a custom error for serializer failures,
 * preserving the serializer name and original cause for clearer debugging and error handling.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export class InterceptorError extends Error {
	public readonly interceptorName?: string | undefined;
	public override readonly cause?: unknown;

	constructor(interceptorName: string | undefined, cause: unknown) {
		const label = interceptorName ? `"${interceptorName}"` : "(anonymous)";
		const causeMsg = cause instanceof Error ? cause.message : String(cause);
		super(`[Subatom] Interceptor ${label} threw: ${causeMsg}`);
		this.name = "InterceptorError";
		this.interceptorName = interceptorName;
		this.cause = cause;
	}
}
