/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
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
			expect(convertInferSchema({ _type: "float" })).toEqual({
				type: "number",
			});
			expect(convertInferSchema({ _type: "double" })).toEqual({
				type: "number",
			});
			expect(convertInferSchema({ _type: "string", coerce: true })).toEqual({
				type: "number",
			});
			expect(convertInferSchema({ _type: "bool" })).toEqual({
				type: "boolean",
			});

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

			const directShapeSchema = {
				_type: "object",
				shape: {
					title: { _type: "string" },
				},
			};
			expect(convertInferSchema(directShapeSchema)).toEqual({
				type: "object",
				properties: {
					title: { type: "string" },
				},
				required: ["title"],
			});

			expect(
				convertInferSchema({
					valid: { _type: "string" },
					invalid: Symbol("unsupported"),
				}),
			).toEqual({
				type: "object",
				properties: {
					valid: { type: "string" },
				},
				required: ["valid"],
			});
		});

		it("should handle array and object schemas with unsupported nested values", () => {
			const arrayWithUnsupportedItems = Object.assign(() => {}, {
				_type: "array",
				items: Symbol("unsupported"),
			});

			expect(convertInferSchema(arrayWithUnsupportedItems)).toEqual({
				type: "array",
			});

			const arrayWithArrayItems = Object.assign(() => {}, {
				_type: "array",
				items: [],
			});
			expect(convertInferSchema(arrayWithArrayItems)).toEqual({
				type: "array",
			});

			expect(convertInferSchema({ _type: "object" })).toEqual({
				type: "object",
			});

			expect(convertInferSchema({ _type: "object", shape: "invalid" })).toEqual(
				{ type: "object" },
			);

			expect(
				convertInferSchema({
					_type: "object",
					shape: {
						invalid: Symbol("unsupported"),
					},
				}),
			).toEqual({
				type: "object",
				properties: {},
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
			expect(
				convertInferSchema({ _type: "string", enumValues: ["admin", "user"] }),
			).toEqual({
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
				{
					method: "USE",
					path: "/middleware",
					handlers: [],
				} as unknown as IRoute,
				{
					method: "GET",
					path: "/openapi.json",
					handlers: [],
				} as unknown as IRoute,
				{
					method: "GET",
					path: "/custom-docs",
					handlers: [],
				} as unknown as IRoute,
			];

			const spec = generateOpenApiSpec(routes, { path: "/custom-docs" });
			expect(Object.keys(spec.paths)).toHaveLength(0);
		});

		it("should handle schema naming edges: leading digits and symbols resulting in Schema fallback", () => {
			const schemaStartingWithDigit = {
				name: "123Schema",
				_type: "object",
				shape: { field: { _type: "string" } },
			};
			const schemaSpecialCharsOnly = {
				name: "@@@!!!***###",
				_type: "object",
				shape: { val: { _type: "number" } },
			};

			const routes: IRoute[] = [
				{
					method: "POST",
					path: "/numeric-name",
					schema: { body: schemaStartingWithDigit },
					handlers: [],
				} as unknown as IRoute,
				{
					method: "POST",
					path: "/symbol-name",
					schema: { body: schemaSpecialCharsOnly },
					handlers: [],
				} as unknown as IRoute,
			];

			const spec = generateOpenApiSpec(routes);
			expect(spec.components?.schemas?.Schema_123Schema).toBeDefined();
			expect(spec.components?.schemas?.Schema).toBeDefined();
		});

		it("should resolve middleware and controller arrays for file uploads", () => {
			const ctrl = () => {};
			ctrl._fileConfig = { type: "array", fieldname: "attachments" };

			const middlewareFn = () => {};

			const routes: IRoute[] = [
				{
					method: "POST",
					path: "/controller-upload",
					middleware: [middlewareFn],
					controller: ctrl,
					handlers: [],
				} as unknown as IRoute,
			];

			const spec = generateOpenApiSpec(routes);
			const op = spec.paths["/controller-upload"].post;
			expect(op.requestBody?.content["multipart/form-data"]).toBeDefined();
		});

		it("should iterate candidate handlers covering all loop branches (empty, non-match, and match)", () => {
			// 1. Candidate handlers present, first does not match, second matches
			const nonMatchingMiddleware = () => {};
			const fileController = () => {};
			fileController._fileConfig = { type: "single", fieldname: "doc" };

			const matchingRoute: IRoute = {
				method: "POST",
				path: "/match-handlers",
				middleware: [nonMatchingMiddleware],
				controller: fileController,
				handlers: [],
			} as unknown as IRoute;

			// 2. Candidate handlers present, none match
			const nonMatchingRoute: IRoute = {
				method: "GET",
				path: "/no-match-handlers",
				handlers: [nonMatchingMiddleware],
			} as unknown as IRoute;

			// 3. Completely empty candidate handlers
			const emptyRoute: IRoute = {
				method: "GET",
				path: "/empty-handlers",
			} as unknown as IRoute;

			const spec = generateOpenApiSpec([
				matchingRoute,
				nonMatchingRoute,
				emptyRoute,
			]);
			expect(
				spec.paths["/match-handlers"].post.requestBody?.content[
					"multipart/form-data"
				],
			).toBeDefined();
			expect(spec.paths["/no-match-handlers"].get).toBeDefined();
			expect(spec.paths["/empty-handlers"].get).toBeDefined();
		});

		it("should cover path parameter optionality branches at line 451", () => {
			const routes: IRoute[] = [
				{
					method: "GET",
					path: "/org/:orgId/users/:userId/:role?",
					schema: {
						params: {
							// 1. optionalParamNames is false, isOptionalSchema is false -> required: true
							orgId: { _type: "string" },
							// 2. optionalParamNames is false, isOptionalSchema is true -> required: false
							userId: { _type: "string", optional: true },
							// 3. optionalParamNames is true (via :role?) -> required: false
							role: { _type: "string" },
						},
					},
					handlers: [],
				} as unknown as IRoute,
			];

			const spec = generateOpenApiSpec(routes);
			const params =
				spec.paths["/org/{orgId}/users/{userId}/{role}"].get.parameters ?? [];

			expect(params.find((p) => p.name === "orgId")?.required).toBe(true);
			expect(params.find((p) => p.name === "userId")?.required).toBe(false);
			expect(params.find((p) => p.name === "role")?.required).toBe(false);
		});

		it("should handle routeSchema.file without fieldname in fileUploadInfo", () => {
			const routes: IRoute[] = [
				{
					method: "POST",
					path: "/file-no-fieldname",
					schema: {
						file: { _isFile: true },
					},
					handlers: [],
				} as unknown as IRoute,
			];

			const spec = generateOpenApiSpec(routes);
			const op = spec.paths["/file-no-fieldname"].post;
			const ref = op.requestBody?.content["multipart/form-data"].schema?.$ref;
			const schemaName = ref ? ref.replace("#/components/schemas/", "") : "";
			expect(
				spec.components?.schemas?.[schemaName]?.properties?.file,
			).toBeDefined();
		});

		it("should handle already-referenced ($ref) schemas in body", () => {
			const routes: IRoute[] = [
				{
					method: "POST",
					path: "/ref-body",
					schema: {
						body: { $ref: "#/components/schemas/PredefinedModel" },
					},
					handlers: [],
				} as unknown as IRoute,
			];

			const spec = generateOpenApiSpec(routes);
			expect(
				spec.paths["/ref-body"].post.requestBody?.content["application/json"]
					.schema,
			).toEqual({ $ref: "#/components/schemas/PredefinedModel" });
		});

		it("should handle query and headers schemas where required array is not defined", () => {
			const routes: IRoute[] = [
				{
					method: "GET",
					path: "/unspecified-required",
					schema: {
						query: {
							q: { _type: "string" },
							opt: { _type: "string", optional: true },
						},
						headers: {
							"x-token": { _type: "string" },
							"x-trace": { _type: "string", optional: true },
						},
					},
					handlers: [],
				} as unknown as IRoute,
			];

			const spec = generateOpenApiSpec(routes);
			const params = spec.paths["/unspecified-required"].get.parameters ?? [];

			expect(params.find((p) => p.name === "q")?.required).toBe(true);
			expect(params.find((p) => p.name === "opt")?.required).toBe(false);
			expect(params.find((p) => p.name === "x-token")?.required).toBe(true);
			expect(params.find((p) => p.name === "x-trace")?.required).toBe(false);
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

			const thirdConflictingSchema = {
				name: "CreateUserPayload",
				_type: "object",
				shape: () => ({
					displayName: { _type: "string" },
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
				{
					method: "PATCH",
					path: "/users",
					schema: { body: thirdConflictingSchema },
					handlers: [],
				} as unknown as IRoute,
			];

			const spec = generateOpenApiSpec(routes);
			expect(
				spec.paths["/users"].post.requestBody?.content["application/json"],
			).toBeDefined();
			expect(
				spec.paths["/users"].put.requestBody?.content["application/json"],
			).toBeDefined();
			expect(spec.components?.schemas?.CreateUserPayload).toBeDefined();
			expect(spec.components?.schemas?.CreateUserPayload_2).toBeDefined();
			expect(spec.components?.schemas?.CreateUserPayload_3).toBeDefined();
		});

		it("should reuse a component reference for the same schema object", () => {
			const sharedSchema = {
				_type: "object",
				shape: () => ({ id: { _type: "string" } }),
			};

			const spec = generateOpenApiSpec([
				{
					method: "POST",
					path: "/shared-one",
					schema: { body: sharedSchema },
					handlers: [],
				} as unknown as IRoute,
				{
					method: "POST",
					path: "/shared-two",
					schema: { body: sharedSchema },
					handlers: [],
				} as unknown as IRoute,
			]);

			expect(
				spec.paths["/shared-two"].post.requestBody?.content["application/json"]
					.schema,
			).toEqual(
				spec.paths["/shared-one"].post.requestBody?.content["application/json"]
					.schema,
			);
		});

		it("should register a function-valued body with the route name", () => {
			const spec = generateOpenApiSpec([
				{
					method: "POST",
					path: "/function-body",
					name: "FunctionBody",
					schema: { body: () => {} },
					handlers: [],
				} as unknown as IRoute,
			]);

			expect(spec.components?.schemas?.FunctionBody).toEqual({
				type: "string",
			});
		});

		it("should handle primitive file rules and explicit parameter requirements", () => {
			const uploadHandler = () => {};
			uploadHandler._fileConfig = { type: "single", fieldname: "file" };

			const spec = generateOpenApiSpec([
				{
					method: "POST",
					path: "/coverage-branches",
					handlers: [uploadHandler],
					schema: {
						query: {
							properties: { search: { type: "string" } },
							required: ["search"],
						},
						headers: {
							properties: { authorization: { type: "string" } },
							required: ["authorization"],
						},
						body: {
							properties: { file: { type: "string" } },
							required: ["file"],
						},
						files: {
							file: { _isFile: true, isOptional: true },
							primitive: true,
						},
					},
				} as unknown as IRoute,
			]);

			const operation = spec.paths["/coverage-branches"].post;
			expect(operation.parameters).toEqual([
				{
					name: "search",
					in: "query",
					required: true,
					schema: { type: "string" },
				},
				{
					name: "authorization",
					in: "header",
					required: true,
					schema: { type: "string" },
				},
			]);
			expect(
				operation.requestBody?.content["multipart/form-data"],
			).toBeDefined();
		});

		it("should cover empty multipart maps and optional query/header schemas", () => {
			const spec = generateOpenApiSpec([
				{
					method: "POST",
					path: "/",
					schema: {
						query: { properties: { q: { type: "string" } } },
						headers: { properties: { h: { type: "string" } } },
						files: {},
					},
					handlers: [],
				} as unknown as IRoute,
			]);

			expect(spec.paths["/"].post.parameters).toEqual([
				{ name: "q", in: "query", required: true, schema: { type: "string" } },
				{ name: "h", in: "header", required: true, schema: { type: "string" } },
			]);
			expect(spec.paths["/"].post.requestBody).toBeDefined();
		});

		it("should cover defensive metadata and route parsing fallbacks", () => {
			const metadata = { fieldname: "file" } as any;
			let _metadataReads = 0;
			let typeReads = 0;
			Object.defineProperty(metadata, "type", {
				get: () => {
					typeReads += 1;
					return typeReads === 1 ? "single" : undefined;
				},
			});
			const fallbackHandler = () => {};
			Object.defineProperty(fallbackHandler, "_fileConfig", {
				get: () => {
					_metadataReads += 1;
					return metadata;
				},
			});

			const fieldsHandler = () => {};
			fieldsHandler._fileConfig = { type: "fields" };

			const routePath = new String("/custom-path") as any;
			routePath.matchAll = () => [[undefined]][Symbol.iterator]();

			let bodyReads = 0;
			const schema = {} as any;
			Object.defineProperty(schema, "body", {
				get: () => {
					bodyReads += 1;
					if (bodyReads < 4) return { _type: "string" };
					return null;
				},
			});

			const spec = generateOpenApiSpec([
				{
					method: "POST",
					path: routePath,
					schema,
					handlers: [fallbackHandler],
				} as unknown as IRoute,
				{
					method: "POST",
					path: "/fields-without-fields",
					schema: { files: {} },
					handlers: [fieldsHandler],
				} as unknown as IRoute,
			]);

			expect(spec.paths["/custom-path"].post.requestBody).toBeDefined();
			expect(
				spec.paths["/fields-without-fields"].post.requestBody,
			).toBeDefined();
		});

		it("should return an empty registered schema for an unsupported primitive body", () => {
			const spec = generateOpenApiSpec([
				{
					method: "POST",
					path: "/unsupported-body",
					schema: { body: Symbol("unsupported") },
					handlers: [],
				} as unknown as IRoute,
			]);

			expect(
				spec.paths["/unsupported-body"].post.requestBody?.content[
					"application/json"
				].schema,
			).toEqual({});
		});

		it("should fall back to Schema for a symbol-only route name", () => {
			const spec = generateOpenApiSpec([
				{
					method: "POST",
					path: "/symbol-only-name",
					name: "???",
					schema: { body: { properties: { id: { type: "string" } } } },
					handlers: [],
				} as unknown as IRoute,
			]);

			expect(spec.components?.schemas?.Schema).toBeDefined();
		});

		it("should find file metadata on a later candidate handler", () => {
			const firstHandler = () => {};
			const uploadHandler = () => {};
			uploadHandler._fileConfig = { type: "single", fieldname: "document" };

			const spec = generateOpenApiSpec([
				{
					method: "POST",
					path: "/later-handler-upload",
					handlers: [firstHandler, uploadHandler],
				} as unknown as IRoute,
			]);

			const ref =
				spec.paths["/later-handler-upload"].post.requestBody?.content[
					"multipart/form-data"
				].schema?.$ref;
			expect(ref).toBeDefined();
			if (!ref) {
				throw new Error("Expected a schema reference");
			}
			expect(
				spec.components?.schemas?.[ref.replace("#/components/schemas/", "")]
					?.properties?.document,
			).toEqual({
				type: "string",
				format: "binary",
				description: "File upload",
			});
		});

		it("should mark an optional schema path parameter as not required", () => {
			const spec = generateOpenApiSpec([
				{
					method: "GET",
					path: "/items/:id",
					schema: {
						params: {
							id: { _type: "string", isOptional: true },
						},
					},
					handlers: [],
				} as unknown as IRoute,
			]);

			expect(spec.paths["/items/{id}"].get.parameters).toContainEqual({
				name: "id",
				in: "path",
				required: false,
				schema: { type: "string" },
			});
		});

		it("should handle multipart file uploads via handler metadata and schema configurations", () => {
			const fileUploadHandler = () => {};
			fileUploadHandler._fileConfig = {
				type: "fields",
				fields: [
					{ name: "avatar", maxCount: 1 },
					{ name: "gallery", maxCount: 5 },
					{ maxCount: 1 },
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
			const ref =
				spec.paths["/single-upload"].post.requestBody?.content[
					"multipart/form-data"
				].schema?.$ref;
			expect(ref).toBeDefined();
			if (!ref) throw new Error("Expected a schema reference");
			const schemaName = ref.replace("#/components/schemas/", "");
			expect(
				spec.components?.schemas?.[schemaName]?.properties?.profile,
			).toBeDefined();
		});
	});

	it("should trigger line 199 when preferredName normalizes to an empty string", () => {
		const symbolSchema = {
			name: "@@@!!!***",
			_type: "object",
			shape: { field: { _type: "string" } },
		};

		const routes: IRoute[] = [
			{
				method: "POST",
				path: "/only-symbols",
				schema: {
					body: symbolSchema,
				},
				handlers: [],
			} as unknown as IRoute,
		];

		const spec = generateOpenApiSpec(routes);
		expect(spec.components?.schemas?.Schema).toBeDefined();
	});
});
