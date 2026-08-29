/**
 * @fileoverview Defines a custom error for transformer hook failures, preserving the hook,
 * transformer name, and original cause for debugging.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { HookName } from "../../pipelines/modifiers/types/modifiers.types.js";

export class TransformerError extends Error {
	public readonly hook: HookName;
	public readonly transformerName?: string | undefined;
	public override readonly cause?: unknown;

	constructor(
		hook: HookName,
		transformerName: string | undefined,
		cause: unknown,
	) {
		const label = transformerName ? `"${transformerName}"` : "(anonymous)";
		const causeMsg = cause instanceof Error ? cause.message : String(cause);
		super(`[Subatom] Transformer ${label} threw during "${hook}": ${causeMsg}`);
		this.name = "TransformerError";
		this.hook = hook;
		this.transformerName = transformerName;
		this.cause = cause;
	}
}
