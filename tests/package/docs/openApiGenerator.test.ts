import { describe, it, expect } from "vitest";
import { generateOpenApiSpec } from "../../../package/core/docs/openApiGenerator.js";
import type { IRoute } from "../../../package/types/framework/router/IRouter.js";

describe("openApiGenerator - generateOpenApiSpec", () => {
    it("should generate standard OpenAPI 3.0.0 scaffold with defaults", () => {
        const spec = generateOpenApiSpec([]);

        expect(spec.openapi).toBe("3.0.0");
        expect(spec.info).toEqual({
            title: "Subatom API Documentation",
            version: "1.0.0",
            description: "Auto-generated API Documentation",
        });
        expect(spec.paths).toEqual({});
    });

    it("should apply custom generator options for info metadata", () => {
        const spec = generateOpenApiSpec([], {
            title: "Enterprise API",
            version: "2.5.0",
            description: "Production Gateway Spec",
        });

        expect(spec.info).toEqual({
            title: "Enterprise API",
            version: "2.5.0",
            description: "Production Gateway Spec",
        });
    });

    it("should ignore routes with HTTP method 'USE'", () => {
        const routes: IRoute[] = [
            {
                method: "USE",
                path: "/api",
                handlers: [function globalMiddleware() {}],
            } as any,
        ];

        const spec = generateOpenApiSpec(routes);
        expect(spec.paths).toEqual({});
    });

    it("should convert path parameters from Express colon syntax to OpenAPI brace syntax", () => {
        const routes: IRoute[] = [
            {
                method: "GET",
                path: "/users/:userId/posts/:postId",
                handlers: [function getPost() {}],
            } as any,
        ];

        const spec = generateOpenApiSpec(routes);
        expect(spec.paths["/users/{userId}/posts/{postId}"]).toBeDefined();
        expect(spec.paths["/users/{userId}/posts/{postId}"].get).toBeDefined();
    });

    it("should aggregate multiple HTTP methods under the same path", () => {
        const routes: IRoute[] = [
            {
                method: "GET",
                path: "/items",
                handlers: [function getItems() {}],
            } as any,
            {
                method: "POST",
                path: "/items",
                handlers: [function createItem() {}],
            } as any,
        ];

        const spec = generateOpenApiSpec(routes);
        expect(spec.paths["/items"].get).toBeDefined();
        expect(spec.paths["/items"].post).toBeDefined();
    });

    it("should build operation metadata with tags, summary, and middleware description", () => {
        function authGuard() {}
        function roleCheck() {}
        
        // Define a truly anonymous handler where fn.name is empty
        const anonymousHandler = (() => {
            const fn = () => {};
            Object.defineProperty(fn, "name", { value: "" });
            return fn;
        })();

        const routes: IRoute[] = [
            {
                method: "GET",
                path: "/admin",
                name: "Admin Dashboard Access",
                tags: ["Admin", "Security"],
                handlers: [authGuard, roleCheck, anonymousHandler],
            } as any,
        ];

        const spec = generateOpenApiSpec(routes);
        const op = spec.paths["/admin"].get;

        expect(op.summary).toBe("Admin Dashboard Access");
        expect(op.tags).toEqual(["Admin", "Security"]);
        expect(op.description).toBe("**Executed Middlewares:** authGuard, roleCheck");
    });

    it("should fallback summary to method and path when name is missing and tag to ['default']", () => {
        const anonymousHandler = (() => {
            const fn = () => {};
            Object.defineProperty(fn, "name", { value: "" });
            return fn;
        })();

        const routes: IRoute[] = [
            {
                method: "DELETE",
                path: "/cache",
                handlers: [anonymousHandler],
            } as any,
        ];

        const spec = generateOpenApiSpec(routes);
        const op = spec.paths["/cache"].delete;

        expect(op.summary).toBe("DELETE /cache");
        expect(op.tags).toEqual(["default"]);
        expect(op.description).toBeUndefined();
    });

    it("should generate application/json requestBody when schema.body is provided", () => {
        const bodySchema = {
            type: "object",
            properties: {
                username: { type: "string" },
                password: { type: "string" },
            },
            required: ["username", "password"],
        };

        const routes: IRoute[] = [
            {
                method: "POST",
                path: "/login",
                schema: { body: bodySchema },
                handlers: [function loginHandler() {}],
            } as any,
        ];

        const spec = generateOpenApiSpec(routes);
        const op = spec.paths["/login"].post;

        expect(op.requestBody).toEqual({
            required: true,
            content: {
                "application/json": {
                    schema: bodySchema,
                },
            },
        });
    });

    describe("Multipart File Upload Schema Generation", () => {
        it("should handle single file upload via handler name fallback and merge body properties", () => {
            // Function name contains lowercase "file" to match fnName.includes("file")
            function upload_file() {}

            const routes: IRoute[] = [
                {
                    method: "POST",
                    path: "/profile/avatar",
                    schema: {
                        body: {
                            properties: {
                                userId: { type: "string" },
                            },
                            required: ["userId"],
                        },
                    },
                    handlers: [upload_file],
                } as any,
            ];

            const spec = generateOpenApiSpec(routes);
            const op = spec.paths["/profile/avatar"].post;

            expect(op.requestBody).toEqual({
                required: true,
                content: {
                    "multipart/form-data": {
                        schema: {
                            type: "object",
                            properties: {
                                userId: { type: "string" },
                                file: {
                                    type: "string",
                                    format: "binary",
                                    description: "Single file upload",
                                },
                            },
                            required: ["userId"],
                        },
                    },
                },
            });
        });

        it("should handle custom single file upload via _fileConfig", () => {
            const customHandler = () => {};
            (customHandler as any)._fileConfig = {
                type: "single",
                fieldname: "document",
            };

            const routes: IRoute[] = [
                {
                    method: "POST",
                    path: "/upload",
                    handlers: [customHandler],
                } as any,
            ];

            const spec = generateOpenApiSpec(routes);
            const op = spec.paths["/upload"].post;

            expect(op.requestBody.content["multipart/form-data"].schema.properties).toEqual({
                document: {
                    type: "string",
                    format: "binary",
                    description: "Single file upload",
                },
            });
            expect(op.requestBody.content["multipart/form-data"].schema.required).toEqual([]);
        });

        it("should handle array file upload with explicit and fallback limits", () => {
            const arrayHandlerWithMax = () => {};
            (arrayHandlerWithMax as any)._fileConfig = {
                type: "array",
                fieldname: "photos",
                maxCount: 10,
            };

            const arrayHandlerUnlimited = () => {};
            (arrayHandlerUnlimited as any)._fileConfig = {
                type: "array",
            };

            const routes: IRoute[] = [
                {
                    method: "POST",
                    path: "/gallery/limited",
                    handlers: [arrayHandlerWithMax],
                } as any,
                {
                    method: "POST",
                    path: "/gallery/unlimited",
                    handlers: [arrayHandlerUnlimited],
                } as any,
            ];

            const spec = generateOpenApiSpec(routes);
            
            const op1 = spec.paths["/gallery/limited"].post;
            expect(op1.requestBody.content["multipart/form-data"].schema.properties).toEqual({
                photos: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                    description: "Array of files (max: 10)",
                },
            });

            const op2 = spec.paths["/gallery/unlimited"].post;
            expect(op2.requestBody.content["multipart/form-data"].schema.properties).toEqual({
                files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                    description: "Array of files (max: unlimited)",
                },
            });
        });

        it("should handle multi-field file upload configurations", () => {
            const fieldsHandler = () => {};
            (fieldsHandler as any)._fileConfig = {
                type: "fields",
                fields: [
                    { name: "avatar", maxCount: 1 },
                    { name: "attachments" },
                ],
            };

            const routes: IRoute[] = [
                {
                    method: "POST",
                    path: "/profile/full",
                    handlers: [fieldsHandler],
                } as any,
            ];

            const spec = generateOpenApiSpec(routes);
            const op = spec.paths["/profile/full"].post;

            expect(op.requestBody.content["multipart/form-data"].schema.properties).toEqual({
                avatar: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                    description: "Field file upload (max: 1)",
                },
                attachments: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                    description: "Field file upload (max: unlimited)",
                },
            });
        });

        it("should safely handle 'fields' type upload when fields list is undefined", () => {
            const fieldsHandler = () => {};
            (fieldsHandler as any)._fileConfig = {
                type: "fields",
            };

            const routes: IRoute[] = [
                {
                    method: "POST",
                    path: "/profile/empty-fields",
                    handlers: [fieldsHandler],
                } as any,
            ];

            const spec = generateOpenApiSpec(routes);
            const op = spec.paths["/profile/empty-fields"].post;

            expect(op.requestBody.content["multipart/form-data"].schema.properties).toEqual({});
        });
    });
});