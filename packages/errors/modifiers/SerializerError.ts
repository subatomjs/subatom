/**
 * @fileoverview Defines a custom error for interceptor failures,
 * preserving the interceptor name and original cause for clearer debugging and error handling.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export class SerializerError extends Error {
	public readonly serializerName: string | undefined;
	public override readonly cause?: unknown;

	constructor(serializerName: string | undefined, cause: unknown) {
		const label = serializerName ? `"${serializerName}"` : "(anonymous)";
		const causeMsg = cause instanceof Error ? cause.message : String(cause);
		super(`[Subatom] Serializer ${label} threw: ${causeMsg}`);
		this.name = "SerializerError";
		this.serializerName = serializerName;
		this.cause = cause;
	}
}
