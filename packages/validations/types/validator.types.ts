/**
 * @fileoverview Types provider file for validators.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export interface ValidationIssue {
	path: string;
	rule: string;
	message: string;
	received?: unknown;
	expected?: unknown;
}

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
	custom?: string;
	// String constraints
	minLength?: number;
	maxLength?: number;
	format?: string;
	pattern?: string;
	// Number constraints
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
	// Array & Object constraints
	minItems?: number;
	maxItems?: number;
	items?: ISchemaBase;
	properties?: Record<string, ISchemaBase>;
	enum?: unknown[];
	// Fallback for custom / dynamic properties
	[key: string]: unknown;
}

export interface SafeParseResult<T = unknown> {
	success: boolean;
	data?: T;
	issues?: ValidationIssue[];
	error?: {
		message?: string;
		issues?: ValidationIssue[];
		details?: ValidationIssue[];
	};
}

export interface SchemaValidatorObject {
	safeParse: (value: unknown) => Promise<SafeParseResult> | SafeParseResult;
	_def?: {
		innerType?: unknown;
		schema?: unknown;
		type?: unknown;
		typeName?: string;
		shape?: (() => Record<string, unknown>) | Record<string, unknown>;
	};
	innerType?: unknown;
	schema?: unknown;
	shape?: Record<string, unknown>;
	type?: unknown;
	_type?: unknown;
	typeName?: string;
	name?: string;
	constructor?: {
		name?: string;
	};
}
