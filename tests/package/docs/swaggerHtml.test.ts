import { describe, it, expect } from "vitest";
import { renderSwaggerUiHtml } from "../../../package/core/docs/swaggerHtml.js";

describe("swaggerHtml - renderSwaggerUiHtml", () => {
    it("should render default Swagger UI HTML with fallback values", () => {
        const html = renderSwaggerUiHtml();

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain('<title>Subatom Docs</title>');
        expect(html).toContain('url: "/openapi.json"');
        expect(html).toContain('src="https://res.cloudinary.com/drdfur81n/image/upload/v1786723813/SubAtom_no_background_lbmgvu.png"');
        expect(html).toContain('href="https://res.cloudinary.com/drdfur81n/image/upload/v1786723815/SubAtom_short_logo_a3aa59.png"');
        expect(html).toContain('alt=" Logo"');
    });

    it("should render custom configuration parameters", () => {
        const customOpenApiUrl = "/api/v1/swagger.json";
        const customLogo = "https://example.com/logo.png";
        const customAppName = "My Custom App";
        const customShortLogo = "https://example.com/favicon.png";

        const html = renderSwaggerUiHtml(
            customOpenApiUrl,
            customLogo,
            customAppName,
            customShortLogo,
        );

        expect(html).toContain(`url: "${customOpenApiUrl}"`);
        expect(html).toContain(`src="${customLogo}"`);
        expect(html).toContain(`href="${customShortLogo}"`);
        expect(html).toContain(`alt="${customAppName} Logo"`);
        expect(html).toContain(`>${customAppName}</span>`);
    });

    it("should include Swagger UI CDN scripts and stylesheets", () => {
        const html = renderSwaggerUiHtml();

        expect(html).toContain("https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css");
        expect(html).toContain("https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js");
        expect(html).toContain("https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js");
        expect(html).toContain('dom_id: \'#swagger-ui\'');
    });
});