import type { IRoute } from "../../types/framework/router/IRouter.js";
import { extractFileMetadata } from "./handlerInspector.js";

export interface OpenApiGeneratorOptions {
  title?: string | undefined;
  version?: string | undefined;
  description?: string | undefined;
  path?: string | undefined;
}

type OpenApiSchema = Record<string, any>;
type OpenApiSpec = Record<string, any>;

interface SchemaRegistry {
  schemas: Record<string, OpenApiSchema>;
  usedNames: Set<string>;
  objectNames: WeakMap<object, string>;
}

function unwrapSchema(schema: any): { unwrapped: any; isOptional: boolean } {
  let current = schema;
  let isOptional = false;

  while (current && typeof current === "object") {
    if (
      current.isOptional === true ||
      current._def?.typeName === "ZodOptional" ||
      current._def?.typeName === "ZodNullable" ||
      current._def?.typeName === "ZodDefault" ||
      current.isNullable === true
    ) {
      isOptional = true;
    }

    const inner =
      current._def?.innerType ??
      current._def?.schema ??
      current.innerType ??
      current.schema ??
      current._def?.type;

    if (inner && inner !== current) {
      current = inner;
    } else {
      break;
    }
  }

  return { unwrapped: current, isOptional };
}

function isOptionalSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const { isOptional } = unwrapSchema(schema);
  return isOptional || (schema as { isOptional?: unknown }).isOptional === true;
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

function getSchemaName(schema: any): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;

  const candidates = [
    schema.title,
    schema.name,
    schema.schemaName,
    schema.typeName,
    schema._typeName,
    schema._def?.title,
    schema._def?.name,
    schema._def?.typeName,
    schema.constructor?.name,
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

function isOpenApiSchema(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("$ref" in value ||
      "type" in value ||
      "properties" in value ||
      "allOf" in value ||
      "anyOf" in value ||
      "oneOf" in value ||
      "items" in value)
  );
}

export function convertInferSchema(
  rawSchema: any,
  seen: WeakSet<object> = new WeakSet(),
): OpenApiSchema | undefined {
  if (rawSchema === undefined || rawSchema === null) return undefined;
  if (isOpenApiSchema(rawSchema)) return { ...rawSchema };

  const { unwrapped: schema } = unwrapSchema(rawSchema);

  if (typeof schema !== "object" && typeof schema !== "function") {
    return undefined;
  }

  if (typeof schema === "object") {
    if (seen.has(schema)) return { type: "object" };
    seen.add(schema);
  }

  // Handle plain key-value rule dictionaries
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

  const jsonSchema: OpenApiSchema = { type: "string" };

  const typeIndicator = String(
    schema?.type ??
      schema?._type ??
      schema?.typeName ??
      schema?._def?.typeName ??
      schema?.name ??
      schema?.constructor?.name ??
      "",
  ).toLowerCase();

  if (typeIndicator.includes("file") || typeIndicator.includes("upload")) {
    return { type: "string", format: "binary" };
  }

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
    const shape = schema?.shape ?? schema?.properties ?? schema?._def?.shape;
    if (shape) {
      const resolvedShape = typeof shape === "function" ? shape() : shape;
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
    schema?.enumValues ??
    schema?.options ??
    schema?._options ??
    schema?._def?.values;

  if (Array.isArray(enumValues)) {
    jsonSchema.enum = [...enumValues];
  }

  return jsonSchema;
}

function registerSchema(
  registry: SchemaRegistry,
  schema: any,
  preferredName: string,
): OpenApiSchema {
  if (schema === undefined || schema === null) return {};
  if (typeof schema === "object" && typeof schema.$ref === "string") {
    return { $ref: schema.$ref };
  }

  if (typeof schema === "object" || typeof schema === "function") {
    const existingName = registry.objectNames.get(schema);
    if (existingName) {
      return { $ref: `#/components/schemas/${existingName}` };
    }
  }

  const converted = convertInferSchema(schema);
  if (!converted) return {};

  const schemaName = getSchemaName(schema) ?? preferredName;
  const componentName = createUniqueSchemaName(registry, schemaName);

  if (typeof schema === "object" || typeof schema === "function") {
    registry.objectNames.set(schema, componentName);
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
  bodySchema: any,
  fileUploadInfo: any,
  schemaFiles: any,
): OpenApiSchema {
  const properties: Record<string, any> = {};

  if (bodySchema?.properties) {
    Object.assign(properties, bodySchema.properties);
  }

  const required = Array.isArray(bodySchema?.required)
    ? [...bodySchema.required]
    : [];

  if (schemaFiles && typeof schemaFiles === "object") {
    for (const [key, rule] of Object.entries(schemaFiles)) {
      properties[key] = {
        type: "string",
        format: "binary",
        description: "File upload",
      };
      if (!isOptionalSchema(rule)) {
        required.push(key);
      }
    }
  }

  if (fileUploadInfo) {
    const fileType = fileUploadInfo?.type ?? "single";
    if (fileType === "fields" && Array.isArray(fileUploadInfo?.fields)) {
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
      }
    } else if (fileType === "array") {
      const fieldName = fileUploadInfo?.fieldname ?? "file";
      properties[fieldName] = {
        type: "array",
        items: { type: "string", format: "binary" },
        description: "Array of files",
      };
    } else {
      const fieldName = fileUploadInfo?.fieldname ?? "file";
      properties[fieldName] = {
        type: "string",
        format: "binary",
        description: "File upload",
      };
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

    const openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
    if (!spec.paths[openApiPath]) {
      spec.paths[openApiPath] = {};
    }

    const httpMethod = route.method.toLowerCase();
    const schema: any = route.schema ?? {};

    const paramsSchema = convertInferSchema(schema.params);
    const querySchema = convertInferSchema(schema.query);
    const bodySchema = convertInferSchema(schema.body);

    let fileUploadInfo: any = null;
    for (const handler of route.handlers) {
      const metadata = extractFileMetadata(handler);
      if (metadata) {
        fileUploadInfo = metadata;
        break;
      }
    }

    const operation: OpenApiSpec = {
      summary: route.name ?? `${route.method} ${route.path}`,
      tags: route.tags && route.tags.length > 0 ? [...route.tags] : ["default"],
      parameters: [],
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

    if (paramsSchema?.properties) {
      for (const [name, propSchema] of Object.entries(
        paramsSchema.properties,
      )) {
        operation.parameters.push({
          name,
          in: "path",
          required: true,
          schema: propSchema,
        });
      }
    }

    if (querySchema?.properties) {
      for (const [name, propSchema] of Object.entries(querySchema.properties)) {
        operation.parameters.push({
          name,
          in: "query",
          required:
            Array.isArray(querySchema.required) &&
            querySchema.required.includes(name),
          schema: propSchema,
        });
      }
    }

    const hasFiles = Boolean(fileUploadInfo || schema.file || schema.files);

    if (hasFiles) {
      const multipartSchema = createMultipartSchema(
        bodySchema,
        fileUploadInfo,
        schema.files,
      );
      const bodySchemaName = createBodySchemaName(
        route,
        openApiPath,
        httpMethod,
      );
      const bodyRef = registerSchema(registry, multipartSchema, bodySchemaName);

      operation.requestBody = {
        content: {
          "multipart/form-data": {
            schema: bodyRef,
          },
        },
        required: true,
      };
    } else if (schema.body) {
      const bodySchemaName = createBodySchemaName(
        route,
        openApiPath,
        httpMethod,
      );
      const bodyRef = registerSchema(registry, schema.body, bodySchemaName);

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

  return spec;
}
