// subatom/package/core/docs/registerDocs.ts

import type { Subatom } from "../bootstrap/subatom/Subatom.js";
import { generateOpenApiSpec } from "./openApiGenerator.js";
import { renderSwaggerUiHtml } from "./swaggerHtml.js";

export interface SetupApiDocsOptions {
	path?: string | undefined;
	title?: string | undefined;
	version?: string | undefined;
	description?: string | undefined;
	/**
	 * When true (default), the OpenAPI spec is generated once and cached in
	 * memory, then regenerated only when `app.router.getRoutes()` reports a
	 * different route count. Regenerating a full spec on every single
	 * request to /openapi.json is wasted work under real traffic — this
	 * avoids that without requiring an explicit cache-invalidation hook.
	 */
	cache?: boolean;
	darkLogoUrl?: string;
	liteLogoUrl?: string;
	appName?: string;
}

export function setupApiDocs(app: Subatom, options?: SetupApiDocsOptions) {
	const docsPath = options?.path || "/docs";
	const specPath = "/openapi.json";
	const shouldCache = options?.cache !== false;

	let cachedSpec: Record<string, any> | null = null;
	let cachedRouteCount = -1;

	function buildSpec(): Record<string, any> {
		const routes = (app as any).router?.getRoutes?.() ?? [];

		if (shouldCache && cachedSpec && routes.length === cachedRouteCount) {
			return cachedSpec;
		}

		const spec = generateOpenApiSpec(routes, {
			...(options?.title !== undefined ? { title: options.title } : {}),
			...(options?.version !== undefined ? { version: options.version } : {}),
			...(options?.description !== undefined
				? { description: options.description }
				: {}),
		});

		if (shouldCache) {
			cachedSpec = spec;
			cachedRouteCount = routes.length;
		}

		return spec;
	}

	// 1. Endpoint serving the OpenAPI JSON Specification
	app.get(specPath, (req, res) => {
		try {
			res.json(buildSpec());
		} catch (err) {
			// A single malformed route/schema must not take down the docs
			// endpoint for an entire API in production — log it and return a
			// clear 500 instead of an unhandled exception / crashed process.
			console.error("[subatom:docs] Failed to generate OpenAPI spec:", err);
			res.status?.(500);
			res.json({
				error: "Failed to generate OpenAPI specification.",
				message: (err as Error).message,
			});
		}
	});

	// 2. Endpoint serving Swagger UI
	app.get(docsPath, (req, res) => {
		const html = renderSwaggerUiHtml(specPath, options?.darkLogoUrl, options?.liteLogoUrl, options?.appName);
		res.setHeader("Content-Type", "text/html");
		res.send(html);
	});
}