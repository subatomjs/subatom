import type { ValidationIssue } from "../../core/validation/ValidationError.js";

export type ValidateFn = (
	value: unknown,
	path: string,
) => Promise<ValidationIssue[]>;

export type CustomValidatorFn = (
	value: unknown,
	path: string,
) => Promise<string | null>;

export interface ISchemaBase {
	type?: string;
	nullable?: boolean;
	required?: string[];
	custom?: string; // Maps to a registered custom validator name
	[key: string]: unknown;
}
