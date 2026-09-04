/**
 * @fileoverview Validates files using a schema’s safeParse, normalizing schema failures
 * into structured ValidationIssue errors and supporting both single and multi-file array validation.
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

		return schemaIssues.map((issue) => {
			let cleanSub = "";
			if (Array.isArray(issue.path)) {
				cleanSub = issue.path.join(".");
			} else if (
				typeof issue.path === "string" ||
				typeof issue.path === "number"
			) {
				cleanSub = String(issue.path);
			}

			const fullPath =
				path && cleanSub ? `${path}.${cleanSub}` : path || cleanSub;

			return {
				path: fullPath,
				rule: issue.rule ?? "validation",
				message: issue.message ?? "File validation failed",
				received: issue.received,
				expected: issue.expected,
			};
		});
	};
}
