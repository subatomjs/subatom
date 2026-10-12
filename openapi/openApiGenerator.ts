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

const ALL_METHOD_EXPANSIONS = ["get", "post", "put", "patch", "delete"] as const;

type UnwrapResult = {
  unwrapped: unknown;
  isOptional: boolean;
  isNullable: boolean;
  isSingleFile: boolean;
  isArrayFiles: boolean;
};

interface ConversionContext {
  seen: WeakSet<object>;
  unwrapCache: WeakMap<object, UnwrapResult>;
  schemaCache: WeakMap<object, OpenApiSchema | undefined>;
}

function createConversionContext(seen?: WeakSet<object>): ConversionContext {
  return {
    seen: seen ?? new WeakSet<object>(),
    unwrapCache: new WeakMap<object, UnwrapResult>(),
    schemaCache: new WeakMap<object, OpenApiSchema | undefined>(),
  };
}

type FileRuleKind = 0 | 1 | 2; // none | single | multiple

function getDirectFileRuleKind(rule: unknown): FileRuleKind {
  if (!rule || (typeof rule !== "object" && typeof rule !== "function")) {
    return 0;
  }

  const r = rule as Record<string, unknown>;
  const def = r._def as Record<string, unknown> | undefined;

  if (
    r.multiple === true ||
    def?.multiple === true ||
    r._isFiles === true ||
    def?._isFiles === true ||
    typeof r.minEach === "function" ||
    typeof r.maxEach === "function" ||
    typeof def?.minEach === "function" ||
    typeof def?.maxEach === "function"
  ) {
    return 2;
  }

  const typeStr = String(
    r.type ?? r._type ?? def?.type ?? def?.typeName ?? r.typeName ?? "",
  ).toLowerCase();

  if (typeStr === "files" || typeStr.endsWith(".files")) return 2;

  if (
    r._isFile === true ||
    def?._isFile === true ||
    typeStr === "file" ||
    typeStr.endsWith(".file") ||
    (typeof r.mime === "function" &&
      typeof r.extension === "function" &&
      typeof r.minEach !== "function")
  ) {
    return 1;
  }

  return 0;
}

export function isMultipleFilesRule(rule: unknown): boolean {
  return getDirectFileRuleKind(rule) === 2;
}

export function isSingleFileRule(rule: unknown): boolean {
  const direct = getDirectFileRuleKind(rule);
  if (direct === 2) return false;
  if (direct === 1) return true;

  const visited = new WeakSet<object>();
  let current: unknown = rule;

  while (
    current &&
    (typeof current === "object" || typeof current === "function")
  ) {
    if (visited.has(current as object)) return false;
    visited.add(current as object);

    const r = current as Record<string, unknown>;
    const def = r._def as Record<string, unknown> | undefined;
    const inner =
      r.innerSchema ??
      def?.innerSchema ??
      def?.innerType ??
      def?.schema ??
      r.innerType ??
      r.schema;

    if (
      !inner ||
      inner === current ||
      (typeof inner !== "object" && typeof inner !== "function")
    ) {
      return false;
    }

    const kind = getDirectFileRuleKind(inner);
    if (kind === 1) return true;
    if (kind === 2) return false;
    current = inner;
  }

  return false;
}

function unwrapSchema(
  schema: unknown,
  context?: ConversionContext,
): UnwrapResult {
  if (
    context &&
    schema &&
    (typeof schema === "object" || typeof schema === "function")
  ) {
    const cached = context.unwrapCache.get(schema as object);
    if (cached) return cached;
  }

  let current: unknown = schema;
  let isOptional = false;
  let isNullable = false;
  let isSingleFile = false;
  let isArrayFiles = false;

  while (
    current &&
    (typeof current === "object" || typeof current === "function")
  ) {
    const obj = current as SchemaLike & Record<string, unknown>;
    const def = obj._def as Record<string, unknown> | undefined;
    const constructorName = obj.constructor?.name ?? "";
    const wrapperName = constructorName.toLowerCase();

    const fileRuleKind = getDirectFileRuleKind(current);
    if (fileRuleKind === 2) {
      isArrayFiles = true;
      isSingleFile = false;
    } else if (fileRuleKind === 1) {
      isSingleFile = true;
      isArrayFiles = false;
    }

    if (
      obj.isOptional === true ||
      obj._optional === true ||
      obj.optional === true ||
      def?.isOptional === true ||
      def?.optional === true ||
      def?.type === "optional" ||
      wrapperName.includes("optionalschema") ||
      wrapperName.includes("defaultschema") ||
      wrapperName.includes("prefaultschema")
    ) {
      isOptional = true;
    }

    if (
      obj.isNullable === true ||
      obj.nullable === true ||
      def?.isNullable === true ||
      def?.nullable === true ||
      def?.type === "nullable" ||
      wrapperName.includes("nullableschema")
    ) {
      isNullable = true;
    }

    let inner =
      obj.innerSchema ??
      def?.innerSchema ??
      def?.innerType ??
      def?.schema ??
      obj.innerType ??
      obj.schema;

    if (!inner && wrapperName.includes("pipeschema")) {
      inner = obj.first;
    } else if (!inner && wrapperName.includes("codecschema")) {
      inner = obj.decoder;
    } else if (
      !inner &&
      wrapperName.includes("lazyschema") &&
      typeof obj.getter === "function"
    ) {
      inner = obj.getter();
    }

    if (
      inner &&
      inner !== current &&
      (typeof inner === "object" || typeof inner === "function")
    ) {
      current = inner;
    } else {
      break;
    }
  }

  const result: UnwrapResult = {
    unwrapped: current,
    isOptional,
    isNullable,
    isSingleFile,
    isArrayFiles,
  };

  if (
    context &&
    schema &&
    (typeof schema === "object" || typeof schema === "function")
  ) {
    context.unwrapCache.set(schema as object, result);
  }

  return result;
}

function isOptionalSchema(
  schema: unknown,
  context?: ConversionContext,
): boolean {
  if (!schema || (typeof schema !== "object" && typeof schema !== "function")) {
    return false;
  }

  const { isOptional } = unwrapSchema(schema, context);
  if (isOptional) return true;

  const raw = schema as Record<string, unknown>;
  const def = raw._def as Record<string, unknown> | undefined;

  return (
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
  if (!schema || (typeof schema !== "object" && typeof schema !== "function")) {
    return undefined;
  }

  const s = schema as SchemaLike;
  const def = (s as Record<string, unknown>)._def as
    | Record<string, unknown>
    | undefined;

  const candidates: unknown[] = [
    s.title,
    // A function's `.name` is normally inferred from its variable/property
    // name (for example, `body`), not an intentional OpenAPI component name.
    // Prefer the route's explicit name for function-valued body schemas.
    typeof schema === "function" ? undefined : s.name,
    s.schemaName,
    s.typeName,
    s._typeName,
    def?.title,
    def?.name,
    def?.typeName,
    s.constructor?.name,
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
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

function looksLikeInferSchema(value: unknown): boolean {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }

  const schema = value as Record<string, unknown>;
  const constructorName = schema.constructor?.name?.toLowerCase() ?? "";

  return (
    schema._def !== undefined ||
    schema._type !== undefined ||
    schema.typeName !== undefined ||
    schema._typeName !== undefined ||
    schema.innerSchema !== undefined ||
    schema.innerType !== undefined ||
    schema.isOptional === true ||
    schema.isNullable === true ||
    schema._isFile === true ||
    schema._isFiles === true ||
    constructorName.endsWith("schema")
  );
}

function isOpenApiSchema(value: unknown): value is OpenApiSchema {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (looksLikeInferSchema(value)) return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.$ref === "string" ||
    typeof obj.type === "string" ||
    Object.hasOwn(obj, "properties") ||
    Object.hasOwn(obj, "items") ||
    Object.hasOwn(obj, "additionalProperties") ||
    Array.isArray(obj.allOf) ||
    Array.isArray(obj.anyOf) ||
    Array.isArray(obj.oneOf)
  );
}

const FORMAT_BY_CHECK: Record<string, string> = {
  email: "email",
  url: "uri",
  httpUrl: "uri",
  uuid: "uuid",
  guid: "uuid",
  datetime: "date-time",
  date: "date",
  time: "time",
  duration: "duration",
  ipv4: "ipv4",
  ipv6: "ipv6",
  hostname: "hostname",
};

function convertInferSchemaInternal(
  rawSchema: unknown,
  context: ConversionContext,
  precomputed?: UnwrapResult,
): OpenApiSchema | undefined {
  if (rawSchema === undefined || rawSchema === null) return undefined;

  // A plain JavaScript array is not a schema descriptor. In particular, an
  // empty `items: []` value should not be misinterpreted as an array schema.
  if (Array.isArray(rawSchema)) return undefined;

  if (isOpenApiSchema(rawSchema)) return { ...rawSchema };

  if (
    rawSchema &&
    (typeof rawSchema === "object" || typeof rawSchema === "function")
  ) {
    const cached = context.schemaCache.get(rawSchema as object);
    if (cached !== undefined) return cached;
  }

  const { unwrapped, isNullable, isSingleFile, isArrayFiles } =
    precomputed ?? unwrapSchema(rawSchema, context);

  if (typeof unwrapped !== "object" && typeof unwrapped !== "function") {
    return undefined;
  }

  if (typeof unwrapped === "object" && unwrapped !== null) {
    if (context.seen.has(unwrapped)) return { type: "object" };
    context.seen.add(unwrapped);
  }

  const schema = unwrapped as SchemaLike & Record<string, unknown>;
  const constructorName =
    typeof schema === "object" || typeof schema === "function"
      ? schema.constructor?.name
      : undefined;
  const def = schema._def as Record<string, unknown> | undefined;

  const typeIndicator = String(
    schema.type ??
      schema._type ??
      schema.typeName ??
      schema._typeName ??
      def?.typeName ??
      def?.type ??
      constructorName ??
      "",
  ).toLowerCase();

  const enumValues =
    schema.enumValues ?? schema.options ?? schema._options ?? def?.values;

  let jsonSchema: OpenApiSchema;

  if (isArrayFiles) {
    jsonSchema = {
      type: "array",
      items: {
        type: "string",
        format: "binary",
      },
      description: "Files upload",
    };
  } else if (isSingleFile) {
    jsonSchema = {
      type: "string",
      format: "binary",
      description: "File upload",
    };
  } else if (typeIndicator.includes("union")) {
    const options = Array.isArray(schema.options) ? schema.options : undefined;
    if (options) {
      const anyOf = options
        .map((option) => convertInferSchemaInternal(option, context))
        .filter((item): item is OpenApiSchema => item !== undefined);
      jsonSchema = anyOf.length > 0 ? { anyOf } : {};
    } else {
      jsonSchema = {};
    }
  } else if (typeIndicator.includes("intersection")) {
    const allOf: OpenApiSchema[] = [];
    if (schema.left !== undefined) {
      const left = convertInferSchemaInternal(schema.left, context);
      if (left) allOf.push(left);
    }
    if (schema.right !== undefined) {
      const right = convertInferSchemaInternal(schema.right, context);
      if (right) allOf.push(right);
    }
    jsonSchema = allOf.length > 0 ? { allOf } : {};
  } else if (typeIndicator.includes("tuple")) {
    const tupleItems = Array.isArray(schema.schemas)
      ? schema.schemas
      : undefined;
    jsonSchema = { type: "array" };
    if (tupleItems) {
      const prefixItems = tupleItems
        .map((item) => convertInferSchemaInternal(item, context))
        .filter((item): item is OpenApiSchema => item !== undefined);
      if (prefixItems.length > 0) {
        jsonSchema.prefixItems = prefixItems;
      }
      const minLength =
        typeof schema.minLength === "number"
          ? schema.minLength
          : prefixItems.length;
      const maxLength =
        typeof schema.maxLength === "number"
          ? schema.maxLength
          : prefixItems.length;
      jsonSchema.minItems = minLength;
      jsonSchema.maxItems = maxLength;
    }
  } else if (typeIndicator.includes("set")) {
    jsonSchema = {
      type: "array",
      uniqueItems: true,
    };
    if (schema.valueSchema !== undefined) {
      const itemSchema = convertInferSchemaInternal(schema.valueSchema, context);
      if (itemSchema) jsonSchema.items = itemSchema;
    }
  } else if (
    typeIndicator.includes("map") ||
    typeIndicator.includes("record")
  ) {
    jsonSchema = {
      type: "object",
    };
    if (schema.valueSchema !== undefined) {
      const valueSchema = convertInferSchemaInternal(schema.valueSchema, context);
      if (valueSchema) jsonSchema.additionalProperties = valueSchema;
    }
    if (schema.keySchema !== undefined) {
      const keySchema = convertInferSchemaInternal(schema.keySchema, context);
      if (keySchema) jsonSchema.propertyNames = keySchema;
    }
  } else if (typeIndicator.includes("array")) {
    jsonSchema = { type: "array" };
    const elementSchema = schema.elementSchema ?? schema.items;
    if (elementSchema !== undefined) {
      const itemsSchema = convertInferSchemaInternal(elementSchema, context);
      if (itemsSchema) jsonSchema.items = itemsSchema;
    }
  } else if (typeIndicator.includes("enum")) {
    if (enumValues instanceof Set) {
      const values = [...enumValues];
      jsonSchema = {
        type: inferOpenApiPrimitiveType(values),
        enum: values,
      };
    } else if (Array.isArray(enumValues)) {
      jsonSchema = {
        type: inferOpenApiPrimitiveType(enumValues),
        enum: [...enumValues],
      };
    } else {
      jsonSchema = { type: "string" };
    }
  } else if (typeIndicator.includes("literal")) {
    const value = schema.value;
    jsonSchema = {
      type: inferOpenApiPrimitiveType([value]),
      ...(value !== undefined ? { enum: [value] } : {}),
    };
  } else if (typeIndicator.includes("date")) {
    jsonSchema = { type: "string", format: "date-time" };
  } else if (typeIndicator.includes("bigint")) {
    jsonSchema = { type: "integer", format: "int64" };
  } else if (
    typeIndicator.includes("number") ||
    typeIndicator.includes("float") ||
    typeIndicator.includes("double") ||
    typeIndicator.includes("nan") ||
    schema.coerce
  ) {
    jsonSchema = { type: "number" };
    const checks = Array.isArray(schema.checks) ? schema.checks : [];
    if (
      checks.some((check) => (check as Record<string, unknown>)?.kind === "int")
    ) {
      jsonSchema.type = "integer";
    }
  } else if (
    typeIndicator.includes("integer") ||
    typeIndicator.includes("int")
  ) {
    jsonSchema = { type: "integer" };
  } else if (
    typeIndicator.includes("boolean") ||
    typeIndicator.includes("bool")
  ) {
    jsonSchema = { type: "boolean" };
  } else if (typeIndicator.includes("null")) {
    jsonSchema = { type: "null" };
  } else if (
    typeIndicator.includes("unknown") ||
    typeIndicator.includes("any") ||
    typeIndicator.includes("symbol")
  ) {
    jsonSchema = {};
  } else if (typeIndicator.includes("never")) {
    jsonSchema = { not: {} };
  } else {
    const isPlainShapeObject =
      constructorName === "Object" &&
      typeof schema.parse !== "function" &&
      typeof schema.validate !== "function" &&
      typeof schema.safeParse !== "function" &&
      schema.shape === undefined &&
      schema.properties === undefined &&
      schema._def === undefined &&
      schema._type === undefined &&
      schema.type === undefined;

    if (
      typeIndicator.includes("object") ||
      isPlainShapeObject ||
      schema.shape ||
      schema.properties
    ) {
      jsonSchema = { type: "object" };
      const shape =
        schema.shape ??
        schema.properties ??
        def?.shape ??
        (isPlainShapeObject ? schema : undefined);

      if (shape) {
        const resolvedShape =
          typeof shape === "function"
            ? (shape as () => Record<string, unknown>)()
            : shape;

        if (resolvedShape && typeof resolvedShape === "object") {
          jsonSchema.properties = {};
          const required: string[] = [];
          for (const [key, value] of Object.entries(resolvedShape)) {
            const inspection = unwrapSchema(value, context);
            const converted = convertInferSchemaInternal(
              value,
              context,
              inspection,
            );
            if (converted !== undefined) {
              jsonSchema.properties[key] = converted;
              if (!inspection.isOptional) required.push(key);
            }
          }
          if (required.length > 0) jsonSchema.required = required;
        }
      }

      if (schema.catchallSchema) {
        const additional = convertInferSchemaInternal(schema.catchallSchema, context);
        if (additional) jsonSchema.additionalProperties = additional;
      } else if (schema.policy === "passthrough") {
        jsonSchema.additionalProperties = true;
      }
    } else {
      jsonSchema = { type: "string" };
    }
  }
  if (typeof schema.format === "string") {
    jsonSchema.format = schema.format;
  } else if (schema.isEmail === true || typeIndicator.includes("email")) {
    jsonSchema.format = "email";
  } else if (schema.isUuid === true || typeIndicator.includes("uuid")) {
    jsonSchema.format = "uuid";
  } else {
    const checks = Array.isArray(schema.checks) ? schema.checks : undefined;
    if (checks) {
      for (let i = 0; i < checks.length; i += 1) {
        const kind = (checks[i] as Record<string, unknown>)?.kind;
        if (typeof kind === "string") {
          const format = FORMAT_BY_CHECK[kind];
          if (format) {
            jsonSchema.format = format;
            break;
          }
        }
      }
    }
  }

  if (Array.isArray(enumValues)) {
    jsonSchema.enum = [...enumValues];
  }

  if (isNullable) {
    jsonSchema = {
      anyOf: [jsonSchema, { type: "null" }],
    };
  }

  if (typeof unwrapped === "object" && unwrapped !== null) {
    context.seen.delete(unwrapped);
  }

  if (
    rawSchema &&
    (typeof rawSchema === "object" || typeof rawSchema === "function")
  ) {
    context.schemaCache.set(rawSchema as object, jsonSchema);
  }

  return jsonSchema;
}

export function convertInferSchema(
  rawSchema: unknown,
  seen?: WeakSet<object>,
): OpenApiSchema | undefined {
  return convertInferSchemaInternal(rawSchema, createConversionContext(seen));
}


function inferOpenApiPrimitiveType(values: unknown[]): string {
  const first = values.find((value) => value !== undefined);
  if (typeof first === "number") return "number";
  if (typeof first === "boolean") return "boolean";
  if (typeof first === "bigint") return "integer";
  if (first === null) return "null";
  return "string";
}

function registerSchema(
  registry: SchemaRegistry,
  schema: unknown,
  preferredName: string,
  context: ConversionContext,
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

  const converted = convertInferSchemaInternal(schema, context);
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
  schemaFiles: unknown,
  context: ConversionContext,
): OpenApiSchema {
  const properties: Record<string, OpenApiSchema> = {};

  if (bodySchema?.properties) {
    Object.assign(properties, bodySchema.properties);
  }

  const required = Array.isArray(bodySchema?.required)
    ? [...(bodySchema.required as string[])]
    : [];

  /*
   * `route.schema.files` is normally a subatom-infer ObjectSchema, not a
   * plain `{ fieldName: rule }` dictionary. Iterating Object.entries() on the
   * schema object leaks implementation fields such as `shape`, `policy`, and
   * `catchallSchema` into OpenAPI. Convert the schema first so that only the
   * declared file properties and its dynamic `additionalProperties` survive.
   */
  const convertedFilesSchema = convertInferSchemaInternal(schemaFiles, context);

  if (convertedFilesSchema?.type === "object") {
    if (convertedFilesSchema.properties) {
      Object.assign(properties, convertedFilesSchema.properties);
    }

    if (Array.isArray(convertedFilesSchema.required)) {
      required.push(...convertedFilesSchema.required);
    }
  }
  let dynamicFileSchema: boolean | OpenApiSchema | undefined;

  if (convertedFilesSchema?.type === "object") {
    const additionalProperties = convertedFilesSchema.additionalProperties;

    if (
      additionalProperties === true ||
      additionalProperties === false ||
      isOpenApiSchema(additionalProperties)
    ) {
      dynamicFileSchema = additionalProperties;
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
    } else if (fileType === "any" && dynamicFileSchema === undefined) {
      dynamicFileSchema = {
        type: "array",
        items: { type: "string", format: "binary" },
        description: "Files upload",
      };
    }
  }

  const schema: OpenApiSchema = { type: "object", properties };

  // A `.files().catchall(...)` schema means arbitrary multipart field names
  // are valid file IDs. JSON Schema/OpenAPI represents that with
  // `additionalProperties`; there is no fixed property name to put in
  // `properties`.
  if (dynamicFileSchema !== undefined) {
    schema.additionalProperties = dynamicFileSchema;
  }

  if (required.length > 0) {
    schema.required = Array.from(new Set(required));
  }

  return schema;
}

/**
 * Use OpenAPI's comma-separated query-array serialization consistently with
 * Subatom's query parser. `form` + `explode: false` produces `?ids=id1,id2`
 * rather than repeating the parameter as `?ids=id1&ids=id2`.
 */
function getQueryParameterSerialization(
  schema: OpenApiSchema,
): Pick<OpenApiParameter, "style" | "explode"> {
  if (schema.type === "array") {
    return { style: "form", explode: false };
  }

  return {};
}

export function generateOpenApiSpec(
  routes: IRoute[],
  options?: OpenApiGeneratorOptions,
): OpenApiSpec {
  const conversionContext = createConversionContext();
  const docsPath = options?.path ?? "/docs";

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

    const paramsSchema = convertInferSchemaInternal(
      routeSchema.params,
      conversionContext,
    );
    const querySchema = convertInferSchemaInternal(
      routeSchema.query,
      conversionContext,
    );
    const headersSchema = convertInferSchemaInternal(
      routeSchema.headers,
      conversionContext,
    );

    let fileUploadInfo: FileMetadata | null = null;

    const routeRecord = route as unknown as Record<string, unknown>;
    const middleware = Array.isArray(routeRecord.middleware)
      ? (routeRecord.middleware as unknown[])
      : undefined;

    if (middleware) {
      for (let i = 0; i < middleware.length; i += 1) {
        const metadata = extractFileMetadata(middleware[i]);
        if (metadata) {
          fileUploadInfo = metadata;
          break;
        }
      }
    }

    if (!fileUploadInfo && Array.isArray(route.handlers)) {
      for (let i = 0; i < route.handlers.length; i += 1) {
        const metadata = extractFileMetadata(route.handlers[i]);
        if (metadata) {
          fileUploadInfo = metadata;
          break;
        }
      }
    }

    if (!fileUploadInfo && routeRecord.controller) {
      fileUploadInfo = extractFileMetadata(routeRecord.controller);
    }

    const hasFiles = Boolean(
      fileUploadInfo || routeSchema.file || routeSchema.files,
    );
    const bodySchema = hasFiles
      ? convertInferSchemaInternal(routeSchema.body, conversionContext)
      : undefined;

    const filesMap = hasFiles
      ? ((routeSchema.files as Record<string, unknown> | undefined) ??
        (routeSchema.file && fileUploadInfo?.fieldname
          ? { [fileUploadInfo.fieldname]: routeSchema.file }
          : routeSchema.file
            ? { file: routeSchema.file }
            : undefined))
      : undefined;

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
          ...getQueryParameterSerialization(propSchema),
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
    const methodsToRegister: readonly string[] =
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
        parameters:
          methodsToRegister.length === 1 ? parameters : [...parameters],
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

      if (hasFiles) {
        const multipartSchema = createMultipartSchema(
          bodySchema,
          fileUploadInfo,
          filesMap,
          conversionContext,
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
          conversionContext,
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
          conversionContext,
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
