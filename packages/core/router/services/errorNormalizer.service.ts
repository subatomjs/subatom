/**
 * @fileoverview Normalizes unknown thrown values into consistent Error objects,
 * preserving existing errors and wrapping strings or non-Error values.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { SubatomError } from "../../../errors/Errors.js";

export function normalizeError(err: unknown): Error {
	if (err instanceof Error) {
		return err;
	}
	if (typeof err === "string") {
		return new SubatomError(err);
	}
	return new SubatomError(
		"A non-Error value was thrown during request handling.",
		{ details: err },
	);
}
