/**
 * @fileoverview Validates objects by checking required
 * properties and recursively validating defined properties against their schemas.
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

export function compileObjectValidator(schema: ISchemaBase): ValidateFn {
	const properties = schema.properties || {};
	const required = schema.required || [];
	const propValidators: Record<string, ValidateFn> = {};

	for (const key of Object.keys(properties)) {
		if (key === "__proto__" || key === "constructor") continue;
		propValidators[key] = SchemaValidator.compile(properties[key]);
	}

	return async (value: unknown, path: string) => {
		const issues: ValidationIssue[] = [];

		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			issues.push({
				path,
				rule: "type",
				message: "Expected object",
				received: typeof value,
			});
			return issues;
		}

		const obj = value as Record<string, unknown>;

		for (const req of required) {
			if (obj[req] === undefined || obj[req] === null) {
				issues.push({
					path: path ? `${path}.${req}` : req,
					rule: "required",
					message: `Missing required property: ${req}`,
				});
			}
		}

		for (const key of Object.keys(propValidators)) {
			if (obj[key] !== undefined) {
				const childPath = path ? `${path}.${key}` : key;
				const validator = propValidators[key];

				if (!validator) continue;

				issues.push(...(await validator(obj[key], childPath)));
			}
		}

		return issues;
	};
}
