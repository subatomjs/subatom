import type {
	ISchemaBase,
	ValidateFn,
} from "../../../types/validation/IValidation.js";
import { SchemaValidator } from "../SchemaValidator.js";
import type { ValidationIssue } from "../ValidationError.js";

export function compileArrayValidator(schema: ISchemaBase): ValidateFn {
	const { minItems, maxItems, items } = schema as any;
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
