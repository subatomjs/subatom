/**
 * @fileoverview VValidates numbers and integers against type, range, exclusive limits,
 * and allowed enum values, returning structured validation issues.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ISchemaBase,
	ValidateFn,
	ValidationIssue,
} from "../types/validator.types.js";

export function compileNumberValidator(schema: ISchemaBase): ValidateFn {
	const {
		minimum,
		maximum,
		exclusiveMinimum,
		exclusiveMaximum,
		enum: enumValues,
	} = schema;
	const isInteger = schema.type === "integer";

	return async (value: unknown, path: string) => {
		const issues: ValidationIssue[] = [];
		if (typeof value !== "number" || Number.isNaN(value)) {
			issues.push({
				path,
				rule: "type",
				message: `Expected ${isInteger ? "integer" : "number"}`,
				received: typeof value,
			});
			return issues;
		}
		if (isInteger && !Number.isInteger(value)) {
			issues.push({
				path,
				rule: "type",
				message: "Expected integer, received float",
				received: value,
			});
		}
		if (minimum !== undefined && value < minimum) {
			issues.push({ path, rule: "minimum", message: `Must be >= ${minimum}` });
		}
		if (maximum !== undefined && value > maximum) {
			issues.push({ path, rule: "maximum", message: `Must be <= ${maximum}` });
		}
		if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
			issues.push({
				path,
				rule: "exclusiveMinimum",
				message: `Must be > ${exclusiveMinimum}`,
			});
		}
		if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) {
			issues.push({
				path,
				rule: "exclusiveMaximum",
				message: `Must be < ${exclusiveMaximum}`,
			});
		}
		if (Array.isArray(enumValues) && !enumValues.includes(value)) {
			issues.push({
				path,
				rule: "enum",
				message: `Must be one of: ${enumValues.join(", ")}`,
			});
		}
		return issues;
	};
}
