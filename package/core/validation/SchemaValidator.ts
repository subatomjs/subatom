import type {
	ISchemaBase,
	ValidateFn,
} from "../../types/validation/IValidation.js";
import type { ValidationIssue } from "./ValidationError.js";
import { compileArrayValidator } from "./validators/array.validator.js";
import { compileBooleanValidator } from "./validators/boolean.validator.js";
import { compileNumberValidator } from "./validators/number.validator.js";
import { compileObjectValidator } from "./validators/object.validator.js";
import { compileStringValidator } from "./validators/string.validator.js";

export class SchemaValidator {
	public static compile(schema: ISchemaBase | unknown): ValidateFn {
		if (typeof schema !== "object" || schema === null) {
			return async () => [];
		}

		const baseSchema = schema as ISchemaBase;
		let typeValidator: ValidateFn;

		switch (baseSchema.type) {
			case "string":
				typeValidator = compileStringValidator(baseSchema);
				break;
			case "number":
			case "integer":
				typeValidator = compileNumberValidator(baseSchema);
				break;
			case "boolean":
				typeValidator = compileBooleanValidator(baseSchema);
				break;
			case "array":
				typeValidator = compileArrayValidator(baseSchema);
				break;
			case "object":
				typeValidator = compileObjectValidator(baseSchema);
				break;
			default:
				// Graceful fallback for custom/unsupported types
				typeValidator = async () => [];
		}

		// Wrap with nullable check
		return async (value: unknown, path: string): Promise<ValidationIssue[]> => {
			if (value === null || value === undefined) {
				if (baseSchema.nullable) return [];
				return [
					{
						path,
						rule: "nullable",
						message: "Value cannot be null or undefined",
					},
				];
			}
			return typeValidator(value, path);
		};
	}
}
