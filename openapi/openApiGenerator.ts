/**
 * @fileoverview The file defines utilities for extracting validated file-upload metadata
 * from handlers, primarily for generating accurate OpenAPI documentation adhering strictly
 * to subatom-infer and FastAPI OpenAPI 3.1 specifications.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRoute } from "../packages/core/router/types/router.types.js";
import { extractFileMetadata } from "./handlerInspector.js";
import type {
	FileMetadata,
	OpenApiGeneratorOptions,
	OpenApiOperation,
	OpenApiParameter,
	OpenApiSchema,
	OpenApiSpec,
	RouteSchemaDescriptor,
	SchemaLike,
	SchemaRegistry,
} from "./types/openapi.types.js";

const VALID_OPENAPI_METHODS = new Set([
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"options",
	"head",
	"trace",
]);

const ALL_METHOD_EXPANSIONS = ["get", "post", "put", "patch", "delete"];

export function isMultipleFilesRule(rule: unknown): boolean {
	if (!rule || typeof rule !== "object") return false;
	const r = rule as Record<string, unknown>;
	const def = r._def as Record<string, unknown> | undefined;

	if (
		r.multiple === true ||
		def?.multiple === true ||
		r._isFiles === true ||
		def?._isFiles === true
	) {
		return true;
	}

	if (
		r.multiple === false ||
		def?.multiple === false ||
		r._isFile === true ||
		def?._isFile === true
	) {
		return false;
	}

	if (
		typeof r.minEach === "function" ||
		typeof r.maxEach === "function" ||
		typeof def?.minEach === "function" ||
		typeof def?.maxEach === "function"
	) {
		return true;
	}

	const typeStr = String(
		r.type ?? r._type ?? def?.type ?? def?.typeName ?? r.typeName ?? "",
	).toLowerCase();

	if (typeStr === "files" || typeStr.endsWith(".files")) {
		return true;
	}

	return false;
}

export function isSingleFileRule(rule: unknown): boolean {
	if (!rule || typeof rule !== "object") return false;
	if (isMultipleFilesRule(rule)) return false;

	const r = rule as Record<string, unknown>;
	const def = r._def as Record<string, unknown> | undefined;

	if (r._isFile === true || def?._isFile === true) return true;

	const typeStr = String(
		r.type ?? r._type ?? def?.type ?? def?.typeName ?? r.typeName ?? "",
	).toLowerCase();

	if (typeStr === "file" || typeStr.endsWith(".file")) return true;

	const inner = def?.innerType ?? def?.schema ?? r.innerType ?? r.schema;
	if (inner && inner !== rule) {
		return isSingleFileRule(inner);
	}

	return (
		typeof r.mime === "function" &&
		typeof r.extension === "function" &&
		typeof r.minEach !== "function"
	);
}

function unwrapSchema(schema: unknown): {
	unwrapped: unknown;
	isOptional: boolean;
	isSingleFile: boolean;
	isArrayFiles: boolean;
} {
	let current: unknown = schema;
	let isOptional = false;
	let isSingleFile = false;
	let isArrayFiles = false;

	while (current && typeof current === "object") {
		const obj = current as SchemaLike & Record<string, unknown>;
		const def = obj._def as Record<string, unknown> | undefined;

		if (isMultipleFilesRule(current)) {
			isArrayFiles = true;
			isSingleFile = false;
		} else if (isSingleFileRule(current)) {
			isSingleFile = true;
			isArrayFiles = false;
		}

		if (
			obj.isOptional === true ||
			obj._optional === true ||
			obj.optional === true ||
			obj.isNullable === true ||
			def?.isOptional === true ||
			def?.optional === true ||
			def?.typeName === "ZodOptional" ||
			def?.typeName === "ZodNullable" ||
			def?.typeName === "ZodDefault" ||
			def?.type === "optional"
		) {
			isOptional = true;
		}

		const inner =
			def?.innerType ?? def?.schema ?? obj.innerType ?? obj.schema ?? def?.type;

		if (inner && inner !== current && typeof inner === "object") {
			current = inner;
		} else {
			break;
		}
	}

	return { unwrapped: current, isOptional, isSingleFile, isArrayFiles };
}

function isOptionalSchema(schema: unknown): boolean {
	if (!schema || typeof schema !== "object") return false;
	const { isOptional } = unwrapSchema(schema);
	const raw = schema as Record<string, unknown>;
	const def = raw._def as Record<string, unknown> | undefined;

	return (
		isOptional ||
		raw.isOptional === true ||
		raw._optional === true ||
		raw.optional === true ||
		def?.isOptional === true ||
		def?.optional === true ||
		def?.type === "optional"
	);
}

function normalizeSchemaName(name: string): string {
	const normalized = name
		.replace(/[^a-zA-Z0-9_$-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");

	if (!normalized) return "Schema";
	if (/^[0-9]/.test(normalized)) return `Schema_${normalized}`;
	return normalized;
}

function createUniqueSchemaName(
	registry: SchemaRegistry,
	preferredName: string,
): string {
	const baseName = normalizeSchemaName(preferredName);

	if (!registry.usedNames.has(baseName)) {
		registry.usedNames.add(baseName);
		return baseName;
	}

	let index = 2;
	while (registry.usedNames.has(`${baseName}_${index}`)) {
		index += 1;
	}

	const uniqueName = `${baseName}_${index}`;
	registry.usedNames.add(uniqueName);
	return uniqueName;
}

function getSchemaName(schema: unknown): string | undefined {
	if (!schema || typeof schema !== "object") return undefined;

	const s = schema as SchemaLike;
	const def = (s as Record<string, unknown>)._def as
		| Record<string, unknown>
		| undefined;

	const candidates = [
		s.title,
		s.name,
		s.schemaName,
		s.typeName,
		s._typeName,
		def?.title as string | undefined,
		def?.name as string | undefined,
		def?.typeName as string | undefined,
		s.constructor?.name,
	];

	for (const candidate of candidates) {
		if (
			typeof candidate === "string" &&
			candidate.trim().length > 0 &&
			candidate !== "Object" &&
			candidate !== "Function"
		) {
			return candidate.trim();
		}
	}

	return undefined;
}

function isOpenApiSchema(value: unknown): value is OpenApiSchema {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const obj = value as Record<string, unknown>;
	return (
		"$ref" in obj ||
		"type" in obj ||
		"properties" in obj ||
		"allOf" in obj ||
		"anyOf" in obj ||
		"oneOf" in obj ||
		"items" in obj
	);
}

export function convertInferSchema(
	rawSchema: unknown,
	seen: WeakSet<object> = new WeakSet(),
): OpenApiSchema | undefined {
	if (rawSchema === undefined || rawSchema === null) return undefined;
	if (isOpenApiSchema(rawSchema)) return { ...rawSchema };

	const { unwrapped, isSingleFile, isArrayFiles } = unwrapSchema(rawSchema);

	if (typeof unwrapped !== "object" && typeof unwrapped !== "function") {
		return undefined;
	}

	if (typeof unwrapped === "object" && unwrapped !== null) {
		if (seen.has(unwrapped)) return { type: "object" };
		seen.add(unwrapped);
	}

	if (isArrayFiles || isMultipleFilesRule(unwrapped)) {
		return {
			type: "array",
			items: {
				type: "string",
				format: "binary",
			},
			description: "Files upload",
		};
	}

	if (isSingleFile || isSingleFileRule(unwrapped)) {
		return {
			type: "string",
			format: "binary",
			description: "File upload",
		};
	}

	const schema = unwrapped as SchemaLike;

	if (
		typeof schema === "object" &&
		!Array.isArray(schema) &&
		typeof schema.parse !== "function" &&
		typeof schema.validate !== "function" &&
		typeof schema.safeParse !== "function" &&
		!schema.shape &&
		!schema._def &&
		!schema._type
	) {
		const properties: Record<string, OpenApiSchema> = {};
		const required: string[] = [];

		for (const [key, rule] of Object.entries(schema)) {
			const converted = convertInferSchema(rule, seen);
			if (converted !== undefined) {
				properties[key] = converted;
				if (!isOptionalSchema(rule)) {
					required.push(key);
				}
			}
		}

		const result: OpenApiSchema = { type: "object", properties };
		if (required.length > 0) result.required = required;
		return result;
	}

	const def = (schema as Record<string, unknown>)?._def as
		| Record<string, unknown>
		| undefined;

	const typeIndicator = String(
		schema?.type ??
			schema?._type ??
			schema?.typeName ??
			def?.typeName ??
			def?.type ??
			"",
	).toLowerCase();

	const jsonSchema: OpenApiSchema = { type: "string" };

	if (typeIndicator.includes("integer") || typeIndicator.includes("int")) {
		jsonSchema.type = "integer";
	} else if (
		typeIndicator.includes("number") ||
		typeIndicator.includes("float") ||
		typeIndicator.includes("double") ||
		schema?.coerce
	) {
		jsonSchema.type = "number";
	} else if (
		typeIndicator.includes("boolean") ||
		typeIndicator.includes("bool")
	) {
		jsonSchema.type = "boolean";
	} else if (typeIndicator.includes("array") || Array.isArray(schema?.items)) {
		jsonSchema.type = "array";
		if (schema?.items && !Array.isArray(schema.items)) {
			const itemsSchema = convertInferSchema(schema.items, seen);
			if (itemsSchema) jsonSchema.items = itemsSchema;
		}
	} else if (
		typeIndicator.includes("object") ||
		schema?.shape ||
		schema?.properties
	) {
		jsonSchema.type = "object";
		const shape = schema?.shape ?? schema?.properties ?? def?.shape;
		if (shape) {
			const resolvedShape =
				typeof shape === "function"
					? (shape as () => Record<string, unknown>)()
					: shape;
			if (resolvedShape && typeof resolvedShape === "object") {
				jsonSchema.properties = {};
				const required: string[] = [];
				for (const [key, value] of Object.entries(resolvedShape)) {
					const converted = convertInferSchema(value, seen);
					if (converted !== undefined) {
						jsonSchema.properties[key] = converted;
						if (!isOptionalSchema(value)) {
							required.push(key);
						}
					}
				}
				if (required.length > 0) jsonSchema.required = required;
			}
		}
	} else {
		jsonSchema.type = "string";
	}

	if (typeof schema?.format === "string") {
		jsonSchema.format = schema.format;
	} else if (schema?.isEmail || typeIndicator.includes("email")) {
		jsonSchema.format = "email";
	} else if (schema?.isUuid || typeIndicator.includes("uuid")) {
		jsonSchema.format = "uuid";
	}

	const enumValues =
		schema?.enumValues ?? schema?.options ?? schema?._options ?? def?.values;

	if (Array.isArray(enumValues)) {
		jsonSchema.enum = [...enumValues];
	}

	return jsonSchema;
}

function registerSchema(
	registry: SchemaRegistry,
	schema: unknown,
	preferredName: string,
): OpenApiSchema {
	// Defensive guard: current call sites only pass truthy schemas.
	/* v8 ignore next */
	if (schema === undefined || schema === null) return {};
	if (
		typeof schema === "object" &&
		schema !== null &&
		"$ref" in schema &&
		typeof (schema as { $ref: unknown }).$ref === "string"
	) {
		return { $ref: (schema as { $ref: string }).$ref };
	}

	if (typeof schema === "object" || typeof schema === "function") {
		const existingName = registry.objectNames.get(schema as object);
		if (existingName) {
			return { $ref: `#/components/schemas/${existingName}` };
		}
	}

	const converted = convertInferSchema(schema);
	if (!converted) return {};

	const schemaName = getSchemaName(schema) ?? preferredName;
	const componentName = createUniqueSchemaName(registry, schemaName);

	if (typeof schema === "object" || typeof schema === "function") {
		registry.objectNames.set(schema as object, componentName);
	}

	registry.schemas[componentName] = { ...converted };
	return { $ref: `#/components/schemas/${componentName}` };
}

function createBodySchemaName(
	route: IRoute,
	openApiPath: string,
	method: string,
): string {
	if (typeof route.name === "string" && route.name.trim().length > 0) {
		return route.name.trim();
	}

	const pathPart = openApiPath
		.replace(/[{}]/g, "")
		.replace(/^\//, "")
		.replace(/\//g, "_")
		.replace(/[^a-zA-Z0-9_]/g, "_");

	return `Body_${pathPart || "root"}_${method}`;
}

function createMultipartSchema(
	bodySchema: OpenApiSchema | undefined,
	fileUploadInfo: FileMetadata | null,
	schemaFiles: Record<string, unknown> | undefined,
): OpenApiSchema {
	const properties: Record<string, OpenApiSchema> = {};

	if (bodySchema?.properties) {
		Object.assign(properties, bodySchema.properties);
	}

	const required = Array.isArray(bodySchema?.required)
		? [...(bodySchema.required as string[])]
		: [];

	if (schemaFiles && typeof schemaFiles === "object") {
		for (const [key, rule] of Object.entries(schemaFiles)) {
			if (isMultipleFilesRule(rule)) {
				properties[key] = {
					type: "array",
					items: { type: "string", format: "binary" },
					description: "Files upload",
				};
			} else {
				properties[key] = {
					type: "string",
					format: "binary",
					description: "File upload",
				};
			}

			if (!isOptionalSchema(rule)) {
				required.push(key);
			} else {
				const idx = required.indexOf(key);
				if (idx !== -1) required.splice(idx, 1);
			}
		}
	}

	if (fileUploadInfo) {
		const fileType = fileUploadInfo.type ?? "single";
		const fieldName = fileUploadInfo.fieldname ?? "file";

		if (fileType === "fields" && Array.isArray(fileUploadInfo.fields)) {
			for (const field of fileUploadInfo.fields) {
				if (!field?.name) continue;
				if (typeof field.maxCount === "number" && field.maxCount > 1) {
					properties[field.name] = {
						type: "array",
						items: { type: "string", format: "binary" },
						description: "Array of files",
					};
				} else {
					properties[field.name] = {
						type: "string",
						format: "binary",
						description: "File upload",
					};
				}
				required.push(field.name);
			}
		} else if (fileType === "array") {
			properties[fieldName] = {
				type: "array",
				items: { type: "string", format: "binary" },
				description: "Array of files",
			};
			required.push(fieldName);
		} else if (fileType === "single") {
			properties[fieldName] = {
				type: "string",
				format: "binary",
				description: "File upload",
			};
			required.push(fieldName);
		}
	}

	const schema: OpenApiSchema = { type: "object", properties };
	if (required.length > 0) {
		schema.required = Array.from(new Set(required));
	}

	return schema;
}

export function generateOpenApiSpec(
	routes: IRoute[],
	options?: OpenApiGeneratorOptions,
): OpenApiSpec {
	const registry: SchemaRegistry = {
		schemas: {},
		usedNames: new Set<string>(),
		objectNames: new WeakMap<object, string>(),
	};

	const spec: OpenApiSpec = {
		openapi: "3.1.0",
		info: {
			title: options?.title ?? "Subatom API Documentation",
			version: options?.version ?? "1.0.0",
			description: options?.description ?? "Auto-generated API Documentation",
		},
		paths: {},
		components: {
			schemas: registry.schemas,
		},
	};

	for (const route of routes) {
		if (route.method === "USE") continue;

		const docsPath = options?.path ?? "/docs";
		if (route.path === "/openapi.json" || route.path === docsPath) continue;

		const optionalParamNames = new Set<string>();
		const matches = route.path.matchAll(/:([a-zA-Z0-9_]+)\?/g);
		for (const match of matches) {
			const param = match[1];
			if (typeof param === "string" && param.length > 0) {
				optionalParamNames.add(param);
			}
		}

		const openApiPath = route.path
			.replace(/:([a-zA-Z0-9_]+)\?/g, "{$1}")
			.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");

		if (!spec.paths[openApiPath]) {
			spec.paths[openApiPath] = {};
		}

		const routeSchema = (route.schema ?? {}) as RouteSchemaDescriptor;

		const paramsSchema = convertInferSchema(routeSchema.params);
		const querySchema = convertInferSchema(routeSchema.query);
		const headersSchema = convertInferSchema(routeSchema.headers);
		const bodySchema = convertInferSchema(routeSchema.body);

		let fileUploadInfo: FileMetadata | null = null;

		const routeRecord = route as unknown as Record<string, unknown>;
		const candidateHandlers: unknown[] = [
			...(Array.isArray(routeRecord.middleware)
				? (routeRecord.middleware as unknown[])
				: []),
			...(Array.isArray(route.handlers) ? route.handlers : []),
			...(routeRecord.controller ? [routeRecord.controller] : []),
		];

		for (const handler of candidateHandlers) {
			const metadata = extractFileMetadata(handler);
			if (metadata) {
				fileUploadInfo = metadata;
				break;
			}
		}

		const parameters: OpenApiParameter[] = [];

		if (paramsSchema?.properties) {
			for (const [name, propSchema] of Object.entries(
				paramsSchema.properties,
			)) {
				const isOptional =
					optionalParamNames.has(name) ||
					isOptionalSchema(
						(routeSchema.params as Record<string, unknown>)?.[name],
					);

				parameters.push({
					name,
					in: "path",
					required: !isOptional,
					schema: propSchema,
				});
			}
		}

		if (querySchema?.properties) {
			for (const [name, propSchema] of Object.entries(querySchema.properties)) {
				const isRequired = Array.isArray(querySchema.required)
					? querySchema.required.includes(name)
					: !isOptionalSchema(
							(routeSchema.query as Record<string, unknown>)?.[name],
						);

				parameters.push({
					name,
					in: "query",
					required: isRequired,
					schema: propSchema,
				});
			}
		}

		if (headersSchema?.properties) {
			for (const [name, propSchema] of Object.entries(
				headersSchema.properties,
			)) {
				const isRequired = Array.isArray(headersSchema.required)
					? headersSchema.required.includes(name)
					: !isOptionalSchema(
							(routeSchema.headers as Record<string, unknown>)?.[name],
						);

				parameters.push({
					name,
					in: "header",
					required: isRequired,
					schema: propSchema,
				});
			}
		}

		const rawMethod = route.method.toLowerCase();
		const methodsToRegister: string[] =
			rawMethod === "all"
				? ALL_METHOD_EXPANSIONS
				: VALID_OPENAPI_METHODS.has(rawMethod)
					? [rawMethod]
					: [];

		for (const httpMethod of methodsToRegister) {
			const operation: OpenApiOperation = {
				summary: route.name ?? `${route.method} ${route.path}`,
				tags:
					route.tags && route.tags.length > 0 ? [...route.tags] : ["default"],
				parameters: [...parameters],
				responses: {
					200: {
						description: "Successful operation",
						content: {
							"application/json": {
								schema: {},
							},
						},
					},
					400: {
						description: "Validation / File error",
					},
				},
			};

			const hasFiles = Boolean(
				fileUploadInfo || routeSchema.file || routeSchema.files,
			);

			if (hasFiles) {
				const filesMap =
					(routeSchema.files as Record<string, unknown> | undefined) ??
					(routeSchema.file && fileUploadInfo?.fieldname
						? { [fileUploadInfo.fieldname]: routeSchema.file }
						: routeSchema.file
							? { file: routeSchema.file }
							: undefined);

				const multipartSchema = createMultipartSchema(
					bodySchema,
					fileUploadInfo,
					filesMap,
				);
				const bodySchemaName = createBodySchemaName(
					route,
					openApiPath,
					httpMethod,
				);
				const bodyRef = registerSchema(
					registry,
					multipartSchema,
					bodySchemaName,
				);

				operation.requestBody = {
					content: {
						"multipart/form-data": {
							schema: bodyRef,
						},
					},
					required: true,
				};
			} else if (routeSchema.body) {
				const bodySchemaName = createBodySchemaName(
					route,
					openApiPath,
					httpMethod,
				);
				const bodyRef = registerSchema(
					registry,
					routeSchema.body,
					bodySchemaName,
				);

				operation.requestBody = {
					content: {
						"application/json": {
							schema: bodyRef,
						},
					},
					required: true,
				};
			}

			spec.paths[openApiPath][httpMethod] = operation;
		}
	}

	return spec;
}
