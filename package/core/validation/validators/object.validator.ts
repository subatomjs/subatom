import type {
	ISchemaBase,
	ValidateFn,
} from "../../../types/validation/IValidation.js";
import { SchemaValidator } from "../SchemaValidator.js";
import type { ValidationIssue } from "../ValidationError.js";

export function compileObjectValidator(schema: ISchemaBase): ValidateFn {
	const properties = (schema.properties as Record<string, any>) || {};
	const required = schema.required || [];
	const propValidators: Record<string, ValidateFn> = {};

	for (const key of Object.keys(properties)) {
		// Prevent prototype pollution traversal
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
