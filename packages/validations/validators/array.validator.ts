/**
 * @fileoverview Validates arrays by checking type, item count limits,
 * and recursively validating each element against the defined item schema.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { SchemaValidator } from "../SchemaValidator.js";
import type {
	ISchemaBase,
	ValidateFn,
	ValidationIssue,
} from "../types/validator.types.js";

export function compileArrayValidator(schema: ISchemaBase): ValidateFn {
	const { minItems, maxItems, items } = schema;
	const itemValidator = items ? SchemaValidator.compile(items) : null;

	return async (value: unknown, path: string) => {
		const issues: ValidationIssue[] = [];
		if (!Array.isArray(value)) {
			issues.push({
				path,
				rule: "type",
				message: "Expected array",
				received: typeof value,
			});
			return issues;
		}
		if (minItems !== undefined && value.length < minItems) {
			issues.push({
				path,
				rule: "minItems",
				message: `Must contain at least ${minItems} items`,
			});
		}
		if (maxItems !== undefined && value.length > maxItems) {
			issues.push({
				path,
				rule: "maxItems",
				message: `Must contain at most ${maxItems} items`,
			});
		}
		if (itemValidator) {
			for (let i = 0; i < value.length; i++) {
				const itemPath = path ? `${path}[${i}]` : `[${i}]`;
				issues.push(...(await itemValidator(value[i], itemPath)));
			}
		}
		return issues;
	};
}
