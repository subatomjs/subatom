/**
 * @fileoverview Validates files using a schema’s safeParse, normalizing schema failures
 * into structured ValidationIssue errors.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ISchemaBase,
	SafeParseResult,
	SchemaValidatorObject,
	ValidateFn,
	ValidationIssue,
} from "../types/validator.types.js";

export function compileFileValidator(schema: ISchemaBase): ValidateFn {
	const validatorObj = schema as unknown as SchemaValidatorObject | undefined;

	return async (value: unknown, path: string): Promise<ValidationIssue[]> => {
		if (!validatorObj || typeof validatorObj.safeParse !== "function") {
			return [
				{
					path,
					rule: "validation",
					message: "Invalid file validation schema",
					received: schema,
				},
			];
		}

		const result = (await validatorObj.safeParse(value)) as SafeParseResult;

		if (result.success) {
			return [];
		}

		const schemaIssues =
			result.issues ?? result.error?.issues ?? result.error?.details ?? [];

		if (!Array.isArray(schemaIssues)) {
			return [
				{
					path,
					rule: "validation",
					message: result.error?.message ?? "File validation failed",
					received: value,
				},
			];
		}

		return schemaIssues.map((issue) => ({
			path: issue.path
				? `${path}.${
						Array.isArray(issue.path) ? issue.path.join(".") : issue.path
					}`
				: path,
			rule: issue.rule ?? "validation",
			message: issue.message ?? "File validation failed",
			received: issue.received,
			expected: issue.expected,
		}));
	};
}
