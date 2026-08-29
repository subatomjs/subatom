/**
 * @fileoverview Sets up OpenAPI documentation endpoints, generating and optionally
 * caching the API specification and serving an interactive Swagger UI.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { Subatom } from "../packages/core/subatom/Subatom.js";
import type { IRoute } from "../packages/core/router/types/router.types.js";
import { generateOpenApiSpec } from "./openApiGenerator.js";
import { renderSwaggerUiHtml } from "./swaggerHtml.js";
import type {
	OpenApiSpec,
	SetupApiDocsOptions,
} from "./types/openapi.types.js";

interface SubatomWithRouter {
	router?: {
		getRoutes?: () => IRoute[];
	};
}

export function setupApiDocs(
	app: Subatom,
	options?: SetupApiDocsOptions,
): void {
	const docsPath = options?.path || "/docs";
	const specPath = "/openapi.json";
	const shouldCache = options?.cache !== false;

	let cachedSpec: OpenApiSpec | null = null;
	let cachedRouteCount = -1;

	function buildSpec(): OpenApiSpec {
		const subatomRouter = (app as unknown as SubatomWithRouter).router;
		const routes = subatomRouter?.getRoutes?.() ?? [];

		if (shouldCache && cachedSpec && routes.length === cachedRouteCount) {
			return cachedSpec;
		}

		const spec = generateOpenApiSpec(routes, {
			...(options?.title !== undefined ? { title: options.title } : {}),
			...(options?.version !== undefined ? { version: options.version } : {}),
			...(options?.description !== undefined
				? { description: options.description }
				: {}),
			...(options?.path !== undefined ? { path: options.path } : {}),
		});

		if (shouldCache) {
			cachedSpec = spec;
			cachedRouteCount = routes.length;
		}

		return spec;
	}

	// 1. Endpoint serving the OpenAPI JSON Specification
	app.get(specPath, (_req, res) => {
		try {
			res.json(buildSpec());
		} catch (err) {
			console.error("[subatom:docs] Failed to generate OpenAPI spec:", err);
			res.status?.(500);
			res.json({
				error: "Failed to generate OpenAPI specification.",
				message: err instanceof Error ? err.message : String(err),
			});
		}
	});

	// 2. Endpoint serving Swagger UI
	app.get(docsPath, (_req, res) => {
		const html = renderSwaggerUiHtml(
			specPath,
			options?.darkLogoUrl,
			options?.liteLogoUrl,
			options?.appName,
		);
		res.setHeader("Content-Type", "text/html");
		res.send(html);
	});
}
