import { describe, expect, it } from "vitest";
import {
    convertInferSchema,
    generateOpenApiSpec,
    isMultipleFilesRule,
    isSingleFileRule,
} from "../../openapi/openApiGenerator.js";
import type { IRoute } from "../../packages/core/router/types/router.types.js";

describe("openApiGenerator", () => {
    describe("isMultipleFilesRule", () => {
        it("should return false for non-objects or falsy values", () => {
            expect(isMultipleFilesRule(null)).toBe(false);
            expect(isMultipleFilesRule(undefined)).toBe(false);
            expect(isMultipleFilesRule("rule")).toBe(false);
            expect(isMultipleFilesRule(123)).toBe(false);
        });

        it("should identify multiple files via explicit booleans", () => {
            expect(isMultipleFilesRule({ multiple: true })).toBe(true);
            expect(isMultipleFilesRule({ _def: { multiple: true } })).toBe(true);
            expect(isMultipleFilesRule({ _isFiles: true })).toBe(true);
            expect(isMultipleFilesRule({ _def: { _isFiles: true } })).toBe(true);
        });

        it("should return false when explicitly single or not multiple", () => {
            expect(isMultipleFilesRule({ multiple: false })).toBe(false);
            expect(isMultipleFilesRule({ _def: { multiple: false } })).toBe(false);
            expect(isMultipleFilesRule({ _isFile: true })).toBe(false);
            expect(isMultipleFilesRule({ _def: { _isFile: true } })).toBe(false);
        });

        it("should identify multiple files via validator methods", () => {
            expect(isMultipleFilesRule({ minEach: () => {} })).toBe(true);
            expect(isMultipleFilesRule({ maxEach: () => {} })).toBe(true);
            expect(isMultipleFilesRule({ _def: { minEach: () => {} } })).toBe(true);
            expect(isMultipleFilesRule({ _def: { maxEach: () => {} } })).toBe(true);
        });

        it("should identify multiple files via type name string indicators", () => {
            expect(isMultipleFilesRule({ type: "files" })).toBe(true);
            expect(isMultipleFilesRule({ _type: "custom.files" })).toBe(true);
            expect(isMultipleFilesRule({ _def: { typeName: "FILES" } })).toBe(true);
            expect(isMultipleFilesRule({ typeName: "my.files" })).toBe(true);
            expect(isMultipleFilesRule({ type: "other" })).toBe(false);
        });
    });

    describe("isSingleFileRule", () => {
        it("should return false for non-objects or multiple files", () => {
            expect(isSingleFileRule(null)).toBe(false);
            expect(isSingleFileRule({ multiple: true })).toBe(false);
        });

        it("should return true when _isFile is set", () => {
            expect(isSingleFileRule({ _isFile: true })).toBe(true);
            expect(isSingleFileRule({ _def: { _isFile: true } })).toBe(true);
        });

        it("should return true when type indicates single file", () => {
            expect(isSingleFileRule({ type: "file" })).toBe(true);
            expect(isSingleFileRule({ _type: "upload.file" })).toBe(true);
            expect(isSingleFileRule({ _def: { type: "FILE" } })).toBe(true);
        });

        it("should inspect recursive inner schemas", () => {
            const wrapped = {
                _def: {
                    innerType: { _isFile: true },
                },
            };
            expect(isSingleFileRule(wrapped)).toBe(true);

            const nestedSchema = {
                schema: { type: "file" },
            };
            expect(isSingleFileRule(nestedSchema)).toBe(true);
        });

        it("should check mime and extension methods", () => {
            const rule = {
                mime: () => true,
                extension: () => true,
            };
            expect(isSingleFileRule(rule)).toBe(true);

            const ruleWithMinEach = {
                mime: () => true,
                extension: () => true,
                minEach: () => true,
            };
            expect(isSingleFileRule(ruleWithMinEach)).toBe(false);
        });
    });

    describe("convertInferSchema", () => {
        it("should return undefined for nullish or non-schema primitive inputs", () => {
            expect(convertInferSchema(undefined)).toBeUndefined();
            expect(convertInferSchema(null)).toBeUndefined();
            expect(convertInferSchema("string")).toBeUndefined();
            expect(convertInferSchema(123)).toBeUndefined();
        });

        it("should return a clone if the object already satisfies OpenApiSchema", () => {
            const existing = { type: "string", format: "date" };
            const result = convertInferSchema(existing);
            expect(result).toEqual(existing);
            expect(result).not.toBe(existing);
        });

        it("should handle cyclic references gracefully", () => {
            const cyclic: Record<string, unknown> = {
                _def: {},
            };
            cyclic._def = { innerType: cyclic };
            const seen = new WeakSet<object>();
            seen.add(cyclic);

            expect(convertInferSchema(cyclic, seen)).toEqual({ type: "object" });
        });

        it("should convert single and array file schemas", () => {
            expect(convertInferSchema({ _isFile: true })).toEqual({
                type: "string",
                format: "binary",
                description: "File upload",
            });

            expect(convertInferSchema({ _isFiles: true })).toEqual({
                type: "array",
                items: {
                    type: "string",
                    format: "binary",
                },
                description: "Files upload",
            });
        });

        it("should convert plain dictionary objects into object schemas", () => {
            const schema = {
                name: { _type: "string" },
                age: { _type: "integer", optional: true },
            };

            expect(convertInferSchema(schema)).toEqual({
                type: "object",
                properties: {
                    name: { type: "string" },
                    age: { type: "integer" },
                },
                required: ["name"],
            });
        });

it("should convert primitives: integer, number, boolean, array, and object shapes", () => {
            expect(convertInferSchema({ _type: "int" })).toEqual({ type: "integer" });
            expect(convertInferSchema({ _type: "float" })).toEqual({ type: "number" });
            expect(convertInferSchema({ _type: "string", coerce: true })).toEqual({ type: "number" });
            expect(convertInferSchema({ _type: "bool" })).toEqual({ type: "boolean" });

            // Wrapped in an optional/default container so rawSchema does not have top-level 'items'
            // to bypass isOpenApiSchema, letting unwrapSchema reveal the array schema for conversion.
            const arraySchema = {
                _def: {
                    typeName: "ZodOptional",
                    innerType: {
                        _type: "array",
                        items: { _type: "string" },
                    },
                },
            };
            expect(convertInferSchema(arraySchema)).toEqual({
                type: "array",
                items: { type: "string" },
            });

            const objectSchema = {
                _type: "object",
                shape: () => ({
                    active: { _type: "boolean" },
                    bio: { _type: "string", isOptional: true },
                }),
            };
            expect(convertInferSchema(objectSchema)).toEqual({
                type: "object",
                properties: {
                    active: { type: "boolean" },
                    bio: { type: "string" },
                },
                required: ["active"],
            });
        });

        it("should convert formats (email, uuid, custom) and enum values", () => {
            expect(convertInferSchema({ _type: "string", format: "uri" })).toEqual({
                type: "string",
                format: "uri",
            });
            expect(convertInferSchema({ _type: "string", isEmail: true })).toEqual({
                type: "string",
                format: "email",
            });
            expect(convertInferSchema({ _type: "string", isUuid: true })).toEqual({
                type: "string",
                format: "uuid",
            });
            expect(convertInferSchema({ _type: "string", enumValues: ["admin", "user"] })).toEqual({
                type: "string",
                enum: ["admin", "user"],
            });
        });
    });

    describe("generateOpenApiSpec", () => {
        it("should generate basic openapi 3.1.0 skeleton with custom options", () => {
            const spec = generateOpenApiSpec([], {
                title: "Core Service",
                version: "2.5.0",
                description: "Gateway docs",
            });

            expect(spec.openapi).toBe("3.1.0");
            expect(spec.info).toEqual({
                title: "Core Service",
                version: "2.5.0",
                description: "Gateway docs",
            });
            expect(spec.paths).toEqual({});
            expect(spec.components?.schemas).toEqual({});
        });

        it("should skip internal USE routes, /openapi.json, and the docs path", () => {
            const routes: IRoute[] = [
                { method: "USE", path: "/middleware", handlers: [] } as unknown as IRoute,
                { method: "GET", path: "/openapi.json", handlers: [] } as unknown as IRoute,
                { method: "GET", path: "/custom-docs", handlers: [] } as unknown as IRoute,
            ];

            const spec = generateOpenApiSpec(routes, { path: "/custom-docs" });
            expect(Object.keys(spec.paths)).toHaveLength(0);
        });

        it("should process route path parameters, query parameters, and header schemas", () => {
            const routes: IRoute[] = [
                {
                    method: "GET",
                    path: "/users/:id/:subId?",
                    tags: ["Users"],
                    schema: {
                        params: {
                            id: { _type: "string" },
                            subId: { _type: "string" },
                        },
                        query: {
                            filter: { _type: "string" },
                            page: { _type: "integer", optional: true },
                        },
                        headers: {
                            "x-api-key": { _type: "string" },
                        },
                    },
                    handlers: [],
                } as unknown as IRoute,
            ];

            const spec = generateOpenApiSpec(routes);
            const getOp = spec.paths["/users/{id}/{subId}"].get;

            expect(getOp).toBeDefined();
            expect(getOp.tags).toEqual(["Users"]);

            expect(getOp.parameters).toBeDefined();
            const params = getOp.parameters ?? [];
            expect(params.find((p) => p.name === "id")).toEqual({
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
            });
            expect(params.find((p) => p.name === "subId")).toEqual({
                name: "subId",
                in: "path",
                required: false,
                schema: { type: "string" },
            });
            expect(params.find((p) => p.name === "filter")).toEqual({
                name: "filter",
                in: "query",
                required: true,
                schema: { type: "string" },
            });
            expect(params.find((p) => p.name === "page")).toEqual({
                name: "page",
                in: "query",
                required: false,
                schema: { type: "integer" },
            });
            expect(params.find((p) => p.name === "x-api-key")).toEqual({
                name: "x-api-key",
                in: "header",
                required: true,
                schema: { type: "string" },
            });
        });

        it("should expand 'ALL' method to standard OpenAPI methods", () => {
            const routes: IRoute[] = [
                {
                    method: "ALL",
                    path: "/resource",
                    handlers: [],
                } as unknown as IRoute,
            ];

            const spec = generateOpenApiSpec(routes);
            expect(Object.keys(spec.paths["/resource"])).toEqual([
                "get",
                "post",
                "put",
                "patch",
                "delete",
            ]);
        });

        it("should ignore invalid/unsupported HTTP methods", () => {
            const routes: IRoute[] = [
                {
                    method: "CUSTOM_VERB",
                    path: "/dummy",
                    handlers: [],
                } as unknown as IRoute,
            ];

            const spec = generateOpenApiSpec(routes);
            expect(spec.paths["/dummy"]).toEqual({});
        });

        it("should register json request body and component schema with unique naming", () => {
            const userSchema = {
                name: "CreateUserPayload",
                _type: "object",
                shape: () => ({
                    username: { _type: "string" },
                }),
            };

            const conflictingSchema = {
                name: "CreateUserPayload",
                _type: "object",
                shape: () => ({
                    email: { _type: "string" },
                }),
            };

            const routes: IRoute[] = [
                {
                    method: "POST",
                    path: "/users",
                    schema: { body: userSchema },
                    handlers: [],
                } as unknown as IRoute,
                {
                    method: "PUT",
                    path: "/users",
                    schema: { body: conflictingSchema },
                    handlers: [],
                } as unknown as IRoute,
            ];

            const spec = generateOpenApiSpec(routes);
            expect(spec.paths["/users"].post.requestBody?.content["application/json"]).toBeDefined();
            expect(spec.paths["/users"].put.requestBody?.content["application/json"]).toBeDefined();
            expect(spec.components?.schemas?.CreateUserPayload).toBeDefined();
            expect(spec.components?.schemas?.CreateUserPayload_2).toBeDefined();
        });

        it("should handle multipart file uploads via handler metadata and schema configurations", () => {
            const fileUploadHandler = () => {};
            fileUploadHandler._fileConfig = {
                type: "fields",
                fields: [
                    { name: "avatar", maxCount: 1 },
                    { name: "gallery", maxCount: 5 },
                ],
            };

            const routes: IRoute[] = [
                {
                    method: "POST",
                    path: "/upload",
                    handlers: [fileUploadHandler],
                    schema: {
                        body: {
                            title: { _type: "string" },
                        },
                        files: {
                            extraDoc: { _isFile: true },
                            multiDocs: { _isFiles: true, isOptional: true },
                        },
                    },
                } as unknown as IRoute,
            ];

            const spec = generateOpenApiSpec(routes);
            const requestBody = spec.paths["/upload"].post.requestBody;

            expect(requestBody?.content["multipart/form-data"]).toBeDefined();
            const ref = requestBody?.content["multipart/form-data"].schema?.$ref;
            expect(ref).toBeDefined();
            if (!ref) {
                throw new Error("Expected multipart schema reference");
            }
            const schemaName = ref.replace("#/components/schemas/", "");
            const generatedSchema = spec.components?.schemas?.[schemaName];

            expect(generatedSchema?.properties?.avatar).toEqual({
                type: "string",
                format: "binary",
                description: "File upload",
            });
            expect(generatedSchema?.properties?.gallery).toEqual({
                type: "array",
                items: { type: "string", format: "binary" },
                description: "Array of files",
            });
            expect(generatedSchema?.properties?.extraDoc).toBeDefined();
            expect(generatedSchema?.properties?.multiDocs).toBeDefined();
            expect(generatedSchema?.required).toContain("avatar");
            expect(generatedSchema?.required).toContain("gallery");
            expect(generatedSchema?.required).toContain("extraDoc");
            expect(generatedSchema?.required).not.toContain("multiDocs");
        });

        it("should map single and array metadata uploads on routes", () => {
            const singleHandler = () => {};
            singleHandler._fileConfig = { type: "single", fieldname: "profile" };

            const routes: IRoute[] = [
                {
                    method: "POST",
                    path: "/single-upload",
                    handlers: [singleHandler],
                    schema: { file: { _type: "string" } },
                } as unknown as IRoute,
            ];

            const spec = generateOpenApiSpec(routes);
            const ref = spec.paths["/single-upload"].post.requestBody?.content["multipart/form-data"].schema?.$ref;
            expect(ref).toBeDefined();
            if (!ref) throw new Error("Expected a schema reference");
            const schemaName = ref.replace("#/components/schemas/", "");
            expect(spec.components?.schemas?.[schemaName]?.properties?.profile).toBeDefined();
        });
    });
});