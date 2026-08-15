// subatom/package/core/docs/openApiGenerator.ts

import type { IRoute } from "../../types/framework/router/IRouter.js";

export interface OpenApiGeneratorOptions {
	title?: string | undefined;
	version?: string | undefined;
	description?: string | undefined;
}

export function generateOpenApiSpec(
	routes: IRoute[],
	options?: OpenApiGeneratorOptions,
) {
	const spec: Record<string, any> = {
		openapi: "3.0.0",
		info: {
			title: options?.title || "Subatom API Documentation",
			version: options?.version || "1.0.0",
			description: options?.description || "Auto-generated API Documentation",
		},
		paths: {},
	};

	for (const route of routes) {
		if (route.method === "USE") continue;

		const openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
		if (!spec.paths[openApiPath]) spec.paths[openApiPath] = {};

		const httpMethod = route.method.toLowerCase();
		const middlewareNames: string[] = [];
		let fileUploadInfo: any = null;

		// 1. Inspect Middleware Pipeline
		for (const handler of route.handlers) {
			const fnName = handler.name || "anonymous";
			if (fnName !== "anonymous") {
				middlewareNames.push(fnName);
			}

			if ((handler as any)._fileConfig || fnName.includes("file")) {
				fileUploadInfo = (handler as any)._fileConfig || {
					type: "single",
					fieldname: "file",
				};
			}
		}

		const operation: Record<string, any> = {
			summary: route.name || `${route.method} ${route.path}`,
			tags: route.tags && route.tags.length > 0 ? route.tags : ["default"],
			description: middlewareNames.length
				? `**Executed Middlewares:** ${middlewareNames.join(", ")}`
				: undefined,
			parameters: [],
			responses: {
				200: { description: "Successful operation" },
				400: { description: "Validation / File error" },
			},
		};

		const bodySchema = route.schema?.body as Record<string, any> | undefined;

		// 2. Handle Request Body (Multipart Form Data vs JSON)
		if (fileUploadInfo) {
			const properties: Record<string, any> = {};

			if (bodySchema?.properties) {
				Object.assign(properties, bodySchema.properties);
			}

			if (fileUploadInfo.type === "single") {
				properties[fileUploadInfo.fieldname || "file"] = {
					type: "string",
					format: "binary",
					description: "Single file upload",
				};
			} else if (fileUploadInfo.type === "array") {
				properties[fileUploadInfo.fieldname || "files"] = {
					type: "array",
					items: { type: "string", format: "binary" },
					description: `Array of files (max: ${
						fileUploadInfo.maxCount || "unlimited"
					})`,
				};
			} else if (fileUploadInfo.type === "fields") {
				for (const field of fileUploadInfo.fields || []) {
					properties[field.name] = {
						type: "array",
						items: { type: "string", format: "binary" },
						description: `Field file upload (max: ${
							field.maxCount || "unlimited"
						})`,
					};
				}
			}

			operation.requestBody = {
				required: true,
				content: {
					"multipart/form-data": {
						schema: {
							type: "object",
							properties,
							required: bodySchema?.required || [],
						},
					},
				},
			};
		} else if (bodySchema) {
			operation.requestBody = {
				required: true,
				content: {
					"application/json": {
						schema: bodySchema,
					},
				},
			};
		}

		spec.paths[openApiPath][httpMethod] = operation;
	}

	return spec;
}
