import type {
	ISchemaBase,
	ValidateFn,
} from "../../../types/validation/IValidation.js";
import type { ValidationIssue } from "../ValidationError.js";

export function compileBooleanValidator(schema: ISchemaBase): ValidateFn {
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
