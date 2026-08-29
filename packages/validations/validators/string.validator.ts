/**
 * @fileoverview Validates strings for type, length, patterns, formats like email/URL/UUID,
 * and allowed enum values.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ISchemaBase,
	ValidateFn,
	ValidationIssue,
} from "../types/validator.types.js";

const FORMATS: Record<string, RegExp> = {
	email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	url: /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i,
	uri: /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i,
	uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	date: /^\d{4}-\d{2}-\d{2}$/,
	ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
};

export function compileStringValidator(schema: ISchemaBase): ValidateFn {
	const { minLength, maxLength, format, pattern, enum: enumValues } = schema;
	const regex = pattern ? new RegExp(pattern) : null;
	const formatRegex = format && FORMATS[format] ? FORMATS[format] : null;

	return async (value: unknown, path: string) => {
		const issues: ValidationIssue[] = [];
		if (typeof value !== "string") {
			issues.push({
				path,
				rule: "type",
				message: "Expected string",
				received: typeof value,
			});
			return issues;
		}
		if (minLength !== undefined && value.length < minLength) {
			issues.push({
				path,
				rule: "minLength",
				message: `Must be at least ${minLength} characters`,
				expected: minLength,
			});
		}
		if (maxLength !== undefined && value.length > maxLength) {
			issues.push({
				path,
				rule: "maxLength",
				message: `Must be at most ${maxLength} characters`,
				expected: maxLength,
			});
		}
		if (regex && !regex.test(value)) {
			issues.push({
				path,
				rule: "pattern",
				message: "Does not match required pattern",
			});
		}
		if (formatRegex && !formatRegex.test(value)) {
			issues.push({
				path,
				rule: "format",
				message: `Invalid ${format} format`,
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
