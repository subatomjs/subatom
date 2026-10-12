/**
 * @fileoverview Types provider of openapi documentation generator operations.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export interface FileFieldConfig {
	name: string;
	maxCount?: number;
}

export interface FileMetadata {
	type: "single" | "array" | "fields" | "any" | "none";
	fieldname?: string;
	maxCount?: number;
	fields?: FileFieldConfig[];
}

export interface OpenApiGeneratorOptions {
	title?: string | undefined;
	version?: string | undefined;
	description?: string | undefined;
	path?: string | undefined;
}

export interface OpenApiParameter {
	name: string;
	in: "path" | "query" | "header" | "cookie";
	required?: boolean;
	description?: string;
	/**
	 * Serialization style for parameter values, as defined by OpenAPI.
	 * Query arrays use `form` with `explode: false` so they serialize as
	 * comma-separated values (for example, `?ids=id1,id2`).
	 */
	style?:
		| "matrix"
		| "label"
		| "form"
		| "simple"
		| "spaceDelimited"
		| "pipeDelimited"
		| "deepObject";
	explode?: boolean;
	schema?: OpenApiSchema;
}

export interface OpenApiMediaType {
	schema?: OpenApiSchema;
}

export interface OpenApiRequestBody {
	description?: string;
	content: Record<string, OpenApiMediaType>;
	required?: boolean;
}

export interface OpenApiResponse {
	description: string;
	content?: Record<string, OpenApiMediaType>;
}

export interface DynamicFileReferenceLocation {
	/**
	 * Schema path to the FileReference object.
	 * `*` represents an object/catchall key and `[]` represents an array item.
	 */
	path: string[];
	/** Path to the referenced multipart field name (`...fileId`). */
	fileIdPath: string[];
	/** Human-readable field name, for example `certificateContent` or `documents[]`. */
	label: string;
	/** True when the FileReference occurs inside an array. */
	multiple: boolean;
}

export interface DynamicFileUploadDocumentation {
	version: 1;
	/** The multipart field name is the `fileId` value from the request body. */
	fieldName: {
		source: "body";
		property: "fileId";
		format: "uuid";
	};
	/** Locations in the JSON body where file references may occur. */
	locations: DynamicFileReferenceLocation[];
	description: string;
}

export interface OpenApiOperation {
	summary?: string;
	description?: string;
	tags?: string[];
	parameters?: OpenApiParameter[];
	requestBody?: OpenApiRequestBody;
	responses: Record<string | number, OpenApiResponse>;
	/** Subatom vendor extension consumed by its Swagger UI integration. */
	"x-subatom-dynamic-files"?: DynamicFileUploadDocumentation;
}

export interface OpenApiSchema {
	type?: string;
	format?: string;
	$ref?: string;
	description?: string;
	properties?: Record<string, OpenApiSchema>;
	required?: string[];
	items?: OpenApiSchema;
	enum?: unknown[];
	allOf?: OpenApiSchema[];
	anyOf?: OpenApiSchema[];
	oneOf?: OpenApiSchema[];
	[key: string]: unknown;
}

export interface OpenApiSpec {
	openapi: string;
	info: {
		title: string;
		version: string;
		description?: string;
	};
	paths: Record<string, Record<string, OpenApiOperation>>;
	components?: {
		schemas?: Record<string, OpenApiSchema>;
	};
	[key: string]: unknown;
}

export interface SchemaRegistry {
	schemas: Record<string, OpenApiSchema>;
	usedNames: Set<string>;
	objectNames: WeakMap<object, string>;
}

export interface SetupApiDocsOptions {
	path?: string | undefined;
	title?: string | undefined;
	version?: string | undefined;
	description?: string | undefined;
	cache?: boolean;
	darkLogoUrl?: string;
	liteLogoUrl?: string;
	appName?: string;
}

export interface SchemaLikeDef {
	title?: string;
	name?: string;
	typeName?: string;
	type?: unknown;
	innerType?: unknown;
	schema?: unknown;
	shape?: unknown;
	values?: unknown[];
	isOptional?: boolean;
	optional?: boolean;
	_isFiles?: boolean;
	[key: string]: unknown;
}

export interface SchemaLike {
	title?: string;
	name?: string;
	schemaName?: string;
	typeName?: string;
	_typeName?: string;
	_isFiles?: boolean;
	isOptional?: boolean;
	isNullable?: boolean;
	coerce?: boolean;
	isEmail?: boolean;
	isUuid?: boolean;
	format?: string;
	enumValues?: unknown[];
	options?: unknown[];
	_options?: unknown[];
	shape?: Record<string, unknown> | (() => Record<string, unknown>);
	properties?: Record<string, unknown>;
	items?: unknown;
	parse?: (...args: unknown[]) => unknown;
	validate?: (...args: unknown[]) => unknown;
	safeParse?: (...args: unknown[]) => unknown;
	_def?: SchemaLikeDef;
	_type?: unknown;
	type?: string;
	constructor?: { name?: string };
	innerType?: unknown;
	schema?: unknown;
	$ref?: string;
}

export interface RouteSchemaDescriptor {
	params?: unknown;
	query?: unknown;
	headers?: unknown;
	body?: unknown;
	file?: unknown;
	files?: Record<string, unknown>;
}
