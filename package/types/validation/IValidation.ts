import type { ValidationIssue } from "../../core/validation/ValidationError.js";

export type ValidateFn = (
	value: unknown,
	path: string,
) => Promise<ValidationIssue[]>;

export interface ISchemaBase {
	type?: string;
	nullable?: boolean;
	required?: string[];
	[key: string]: unknown;
}
