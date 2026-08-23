// subatom/package/core/docs/openApiGenerator.ts

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

/**
 * Converts arbitrary schema/type names into valid, stable OpenAPI component names.
 */
function normalizeSchemaName(name: string): string {
  const normalized = name
    .replace(/[^a-zA-Z0-9_$-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    return "Schema";
  }

  if (/^[0-9]/.test(normalized)) {
    return `Schema_${normalized}`;
  }

  return normalized;
}

/**
 * Creates a deterministic unique schema name.
 */
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

/**
 * Attempts to extract a meaningful name from a schema implementation.
 *
 * This intentionally supports several common schema representations without
 * depending on any specific validation library.
 */
function getSchemaName(schema: any): string | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }

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

/**
 * Determines whether an object already resembles an OpenAPI schema.
 */
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

/**
 * Converts an arbitrary SubAtom schema into an OpenAPI schema.
 *
 * This function deliberately does not mutate the source schema.
 */
function convertInferSchema(
  schema: any,
  seen: WeakSet<object> = new WeakSet(),
): OpenApiSchema | undefined {
  if (schema === undefined || schema === null) {
    return undefined;
  }

  /*
   * Already an OpenAPI schema.
   *
   * Return a shallow copy so the original schema cannot be mutated
   * accidentally by documentation generation.
   */
  if (isOpenApiSchema(schema)) {
    return { ...schema };
  }

  /*
   * Primitive values are not schema definitions.
   */
  if (typeof schema !== "object" && typeof schema !== "function") {
    return undefined;
  }

  /*
   * Protect documentation generation from circular schema objects.
   *
   * A malformed/circular schema must never crash the /openapi.json
   * endpoint.
   */
  if (typeof schema === "object") {
    if (seen.has(schema)) {
      return {
        type: "object",
      };
    }

    seen.add(schema);
  }

  /*
   * Plain object schema:
   *
   * {
   *   name: stringSchema,
   *   age: numberSchema
   * }
   */
  if (
    typeof schema === "object" &&
    !Array.isArray(schema) &&
    typeof schema.parse !== "function" &&
    typeof schema.validate !== "function" &&
    !schema.shape &&
    !schema._def
  ) {
    const properties: Record<string, OpenApiSchema> = {};
    const required: string[] = [];

    for (const [key, rule] of Object.entries(schema)) {
      const converted = convertInferSchema(rule, seen);

      if (converted !== undefined) {
        properties[key] = converted;
        required.push(key);
      }
    }

    const result: OpenApiSchema = {
      type: "object",
      properties,
    };

    if (required.length > 0) {
      result.required = required;
    }

    return result;
  }

  const jsonSchema: OpenApiSchema = {
    type: "string",
  };

  const typeIndicator = String(
    schema?.type ??
      schema?._type ??
      schema?.typeName ??
      schema?._def?.typeName ??
      schema?.constructor?.name ??
      "",
  ).toLowerCase();

  /*
   * Number / integer
   */
  if (typeIndicator.includes("integer") || typeIndicator.includes("int")) {
    jsonSchema.type = "integer";
  } else if (typeIndicator.includes("number") || schema?.coerce) {
    jsonSchema.type = "number";
  } else if (typeIndicator.includes("boolean")) {
    /*
     * Boolean
     */
    jsonSchema.type = "boolean";
  } else if (typeIndicator.includes("array") || Array.isArray(schema?.items)) {
    /*
     * Array
     */
    jsonSchema.type = "array";

    if (schema?.items && !Array.isArray(schema.items)) {
      const itemsSchema = convertInferSchema(schema.items, seen);

      if (itemsSchema) {
        jsonSchema.items = itemsSchema;
      }
    }
  } else if (
    /*
     * Object
     */
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

        for (const [key, value] of Object.entries(resolvedShape)) {
          const converted = convertInferSchema(value, seen);

          if (converted !== undefined) {
            jsonSchema.properties[key] = converted;
          }
        }
      }
    }
  } else {
    /*
     * String
     */
    jsonSchema.type = "string";
  }

  /*
   * Format
   */
  if (typeof schema?.format === "string") {
    jsonSchema.format = schema.format;
  } else if (schema?.isEmail || typeIndicator.includes("email")) {
    jsonSchema.format = "email";
  } else if (schema?.isUuid || typeIndicator.includes("uuid")) {
    jsonSchema.format = "uuid";
  }

  /*
   * Enum
   */
  const enumValues =
    schema?.enumValues ??
    schema?.options ??
    schema?._options ??
    schema?._def?.values;

  if (Array.isArray(enumValues)) {
    jsonSchema.enum = [...enumValues];
  }

  /*
   * Minimum
   */
  const minVal =
    schema?.minValue ??
    schema?.minVal ??
    schema?._min ??
    schema?._def?.checks?.find?.((check: any) => check?.kind === "min")?.value;

  if (minVal !== undefined) {
    if (jsonSchema.type === "string") {
      jsonSchema.minLength = minVal;
    }

    if (jsonSchema.type === "number" || jsonSchema.type === "integer") {
      jsonSchema.minimum = minVal;
    }

    if (jsonSchema.type === "array") {
      jsonSchema.minItems = minVal;
    }
  }

  /*
   * Maximum
   */
  const maxVal =
    schema?.maxValue ??
    schema?.maxVal ??
    schema?._max ??
    schema?._def?.checks?.find?.((check: any) => check?.kind === "max")?.value;

  if (maxVal !== undefined) {
    if (jsonSchema.type === "string") {
      jsonSchema.maxLength = maxVal;
    }

    if (jsonSchema.type === "number" || jsonSchema.type === "integer") {
      jsonSchema.maximum = maxVal;
    }

    if (jsonSchema.type === "array") {
      jsonSchema.maxItems = maxVal;
    }
  }

  /*
   * Description
   */
  if (typeof schema?.description === "string") {
    jsonSchema.description = schema.description;
  }

  /*
   * Title
   */
  if (typeof schema?.title === "string") {
    jsonSchema.title = schema.title;
  }

  return jsonSchema;
}

/**
 * Registers a schema as an OpenAPI component and returns its $ref.
 *
 * Schemas are registered once and reused everywhere. This avoids generating
 * large duplicated inline schemas throughout the specification.
 */
function registerSchema(
  registry: SchemaRegistry,
  schema: any,
  preferredName: string,
): OpenApiSchema {
  if (schema === undefined || schema === null) {
    return {};
  }

  /*
   * If this is already an explicit OpenAPI $ref, preserve it.
   */
  if (
    typeof schema === "object" &&
    schema !== null &&
    typeof schema.$ref === "string"
  ) {
    return {
      $ref: schema.$ref,
    };
  }

  /*
   * Reuse a previously registered object schema.
   */
  if (typeof schema === "object" || typeof schema === "function") {
    const existingName = registry.objectNames.get(schema);

    if (existingName) {
      return {
        $ref: `#/components/schemas/${existingName}`,
      };
    }
  }

  const converted = convertInferSchema(schema);

  if (!converted) {
    return {};
  }

  /*
   * Prefer explicit schema metadata.
   * Otherwise use the caller-provided deterministic name.
   */
  const schemaName = getSchemaName(schema) ?? preferredName;

  const componentName = createUniqueSchemaName(registry, schemaName);

  if (typeof schema === "object" || typeof schema === "function") {
    registry.objectNames.set(schema, componentName);
  }

  /*
   * Remove a title only when it is identical to the component name.
   * Keeping meaningful titles preserves useful Swagger UI metadata.
   */
  const componentSchema = {
    ...converted,
  };

  registry.schemas[componentName] = componentSchema;

  return {
    $ref: `#/components/schemas/${componentName}`,
  };
}

/**
 * Creates a deterministic component name for a request body.
 */
function createBodySchemaName(
  route: IRoute,
  openApiPath: string,
  method: string,
): string {
  const routeName =
    typeof route.name === "string" && route.name.trim().length > 0
      ? route.name.trim()
      : undefined;

  if (routeName) {
    return routeName;
  }

  /*
   * FastAPI-style fallback for anonymous request bodies.
   *
   * Example:
   *
   * Body_upload_file_upload_post
   */
  const pathPart = openApiPath
    .replace(/[{}]/g, "")
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_");

  const safePath = pathPart || "root";

  return `Body_${safePath}_${method}`;
}

/**
 * Creates a reusable multipart request-body schema.
 */
function createMultipartSchema(
  bodySchema: any,
  fileUploadInfo: any,
): OpenApiSchema {
  const properties: Record<string, any> = {};

  if (bodySchema?.properties) {
    Object.assign(properties, bodySchema.properties);
  }

  const required = Array.isArray(bodySchema?.required)
    ? [...bodySchema.required]
    : [];

  const fileType = fileUploadInfo?.type ?? "single";

  /*
   * fields()
   */
  if (fileType === "fields" && Array.isArray(fileUploadInfo?.fields)) {
    for (const field of fileUploadInfo.fields) {
      if (!field || typeof field.name !== "string" || field.name.length === 0) {
        continue;
      }

      if (typeof field.maxCount === "number" && field.maxCount > 1) {
        properties[field.name] = {
          type: "array",
          items: {
            type: "string",
            format: "binary",
          },
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
    /*
     * array()
     */
    const fieldName = fileUploadInfo?.fieldname ?? "file";

    properties[fieldName] = {
      type: "array",
      items: {
        type: "string",
        format: "binary",
      },
      description: "Array of files",
    };
  } else {
    /*
     * single()
     */
    const fieldName = fileUploadInfo?.fieldname ?? "file";

    properties[fieldName] = {
      type: "string",
      format: "binary",
      description: "File upload",
    };
  }

  const schema: OpenApiSchema = {
    type: "object",
    properties,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Generates an OpenAPI 3.1 specification from SubAtom routes.
 *
 * Developer-facing schema definitions remain single-source:
 *
 *     schema: {
 *         body: UserSchema
 *     }
 *
 * SubAtom converts the schema into reusable OpenAPI components automatically.
 */
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
    /*
     * USE middleware is not an API operation.
     */
    if (route.method === "USE") {
      continue;
    }

    /*
     * Internal documentation endpoints must not appear
     * in their own documentation.
     */
    const docsPath = options?.path ?? "/docs";

    if (route.path === "/openapi.json" || route.path === docsPath) {
      continue;
    }

    /*
     * Convert:
     *
     * /users/:id
     *
     * into:
     *
     * /users/{id}
     */
    const openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");

    if (!spec.paths[openApiPath]) {
      spec.paths[openApiPath] = {};
    }

    const httpMethod = route.method.toLowerCase();

    const schema: any = route.schema ?? {};

    /*
     * ---------------------------------------------------------
     * Parameters
     * ---------------------------------------------------------
     */

    const paramsSchema = convertInferSchema(schema.params);

    const querySchema = convertInferSchema(schema.query);

    /*
     * ---------------------------------------------------------
     * Body
     * ---------------------------------------------------------
     */

    const bodySchema = convertInferSchema(schema.body);

    /*
     * ---------------------------------------------------------
     * File upload
     * ---------------------------------------------------------
     *
     * handlerInspector is the canonical source of file
     * middleware metadata.
     */
    let fileUploadInfo: any = null;

    for (const handler of route.handlers) {
      const metadata = extractFileMetadata(handler);

      if (metadata) {
        fileUploadInfo = metadata;
        break;
      }
    }

    /*
     * ---------------------------------------------------------
     * Operation
     * ---------------------------------------------------------
     */

    const operation: OpenApiSpec = {
      summary: route.name ?? `${route.method} ${route.path}`,

      tags: route.tags && route.tags.length > 0 ? [...route.tags] : ["default"],

      parameters: [],

      responses: {
        /*
         * The response schema is intentionally empty.
         *
         * SubAtom does not require developers to declare
         * a response schema separately.
         *
         * The important OpenAPI structure is still emitted:
         *
         * 200
         *   -> content
         *      -> application/json
         *         -> schema
         */
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

    /*
     * ---------------------------------------------------------
     * Path parameters
     * ---------------------------------------------------------
     */

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

    /*
     * ---------------------------------------------------------
     * Query parameters
     * ---------------------------------------------------------
     */

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

    /*
     * ---------------------------------------------------------
     * Multipart request body
     * ---------------------------------------------------------
     */

    if (fileUploadInfo || schema.file) {
      const multipartSchema = createMultipartSchema(bodySchema, fileUploadInfo);

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
      /*
       * ---------------------------------------------------------
       * Normal JSON request body
       * ---------------------------------------------------------
       */
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

    /*
     * ---------------------------------------------------------
     * Save operation
     * ---------------------------------------------------------
     */

    spec.paths[openApiPath][httpMethod] = operation;
  }

  return spec;
}
