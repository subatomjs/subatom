import type {
	CustomValidatorFn,
	ISchemaBase,
	ValidateFn,
} from "../../types/validation/IValidation.js";
import type { ValidationIssue } from "./ValidationError.js";
import { compileArrayValidator } from "./validators/array.validator.js";
import { compileBooleanValidator } from "./validators/boolean.validator.js";
import { compileFileValidator } from "./validators/file.validator.js";
import { compileNumberValidator } from "./validators/number.validator.js";
import { compileObjectValidator } from "./validators/object.validator.js";
import { compileStringValidator } from "./validators/string.validator.js";

export class SchemaValidator {
	private static customRegistry = new Map<string, CustomValidatorFn>();

	/**
	 * Registers a custom validation rule globally.
	 * @param name The identifier used in the `custom: "name"` schema property.
	 * @param validator Async function returning an error string, or null if valid.
	 */
	public static registerRule(name: string, validator: CustomValidatorFn): void {
		SchemaValidator.customRegistry.set(name, validator);
	}

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
			case "file":
				typeValidator = compileFileValidator(baseSchema);
				break;
			default:
				typeValidator = async () => [];
		}

		const customRuleName = baseSchema.custom;
		const customValidator = customRuleName
			? SchemaValidator.customRegistry.get(customRuleName)
			: null;

		if (customRuleName && !customValidator) {
			console.warn(
				`[Subatom Validator] Custom rule "${customRuleName}" was requested but not registered.`,
			);
		}

		return async (value: unknown, path: string): Promise<ValidationIssue[]> => {
			// 1. Nullability Check
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

			// 2. Type & Structural Validation
			const issues = await typeValidator(value, path);

			// 3. Custom Rule Validation (only runs if structural validation passes)
			if (customValidator && issues.length === 0) {
				const customErrorMessage = await customValidator(value, path);
				if (customErrorMessage) {
					issues.push({ path, rule: "custom", message: customErrorMessage });
				}
			}

			return issues;
		};
	}
}
