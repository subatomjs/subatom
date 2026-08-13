// subatom/package/core/docs/registerDocs.ts

import type { Subatom } from "../bootstrap/subatom/Subatom.js";
import { generateOpenApiSpec } from "./openApiGenerator.js";
import { renderSwaggerUiHtml } from "./swaggerHtml.js";

export interface SetupApiDocsOptions {
  path?: string | undefined;
  title?: string | undefined;
  version?: string | undefined;
  description?: string | undefined;
}

export function setupApiDocs(app: Subatom, options?: SetupApiDocsOptions) {
  const docsPath = options?.path || "/docs";
  const specPath = "/openapi.json";

  // 1. Endpoint serving the OpenAPI JSON Specification
  app.get(specPath, (req, res) => {
    const routes = (app as any).router.getRoutes();
    const spec = generateOpenApiSpec(routes, {
      ...(options?.title !== undefined ? { title: options.title } : {}),
      ...(options?.version !== undefined ? { version: options.version } : {}),
      ...(options?.description !== undefined
        ? { description: options.description }
        : {}),
    });
    res.json(spec);
  });

  // 2. Endpoint serving Swagger UI
  app.get(docsPath, (req, res) => {
    const html = renderSwaggerUiHtml(specPath);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });
}
