/**
 * @fileoverview Validates that a value is a boolean and returns a structured type
 * error when the value is not true or false.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ISchemaBase,
	ValidateFn,
	ValidationIssue,
} from "../types/validator.types.js";

export function compileBooleanValidator(_schema: ISchemaBase): ValidateFn {
	return async (value: unknown, path: string) => {
		const issues: ValidationIssue[] = [];
		if (typeof value !== "boolean") {
			issues.push({
				path,
				rule: "type",
				message: "Expected boolean",
				received: typeof value,
			});
		}
		return issues;
	};
}
