import { describe, expect, it } from "vitest";
import { renderSwaggerUiHtml } from "../../openapi/swaggerHtml.js";

describe("swaggerHtml", () => {
	describe("renderSwaggerUiHtml", () => {
		it("should render default Swagger UI HTML when no arguments are provided", () => {
			const html = renderSwaggerUiHtml();

			expect(html).toContain("<!doctype html>");
			expect(html).toContain("<title>SubAtom API</title>");
			expect(html).toContain("/openapi.json");
			expect(html).toContain(
				"https://res.cloudinary.com/drdfur81n/image/upload/v1787205861/subatom_dark_frbair.png",
			);
			expect(html).toContain(
				"https://res.cloudinary.com/drdfur81n/image/upload/v1787205050/subatom_lite_tpaiuf.png",
			);
			expect(html).toContain(
				"https://res.cloudinary.com/drdfur81n/image/upload/v1786723815/SubAtom_short_logo_a3aa59.png",
			);
		});

		it("should render custom title, logo, and endpoint configurations", () => {
			const html = renderSwaggerUiHtml(
				"/api/v2/spec.json",
				"https://cdn.example.com/dark.png",
				"https://cdn.example.com/lite.png",
				"Custom Microservice API",
				"https://cdn.example.com/fav.png",
			);

			expect(html).toContain("<title>Custom Microservice API</title>");
			expect(html).toContain("/api/v2/spec.json");
			expect(html).toContain("https://cdn.example.com/dark.png");
			expect(html).toContain("https://cdn.example.com/lite.png");
			expect(html).toContain('href="https://cdn.example.com/fav.png"');
		});

		it("should escape special HTML characters in configuration attributes", () => {
			const html = renderSwaggerUiHtml(
				"/openapi.json?a=1&b=2<script>",
				"https://test.com/dark-logo.png",
				"https://test.com/lite-logo.png",
				"SubAtom <Secure> & 'App'",
				"https://test.com/icon\"xss'?size=32&format=png",
			);

			// Attributes and elements rendered into the DOM
			expect(html).toContain("&amp;b=2&lt;script&gt;");
			expect(html).toContain("SubAtom &lt;Secure&gt; &amp; &#39;App&#39;");
			expect(html).toContain(
				'href="https://test.com/icon&quot;xss&#39;?size=32&amp;format=png"',
			);

			// Runtime config JSON payload
			expect(html).toContain('"appName":"SubAtom \\u003cSecure> & \'App\'"');
		});

		it("should safely serialize runtimeConfig escaping script breaks", () => {
			const maliciousTitle = "</script><script>alert('pwned')</script>";
			const html = renderSwaggerUiHtml(
				undefined,
				undefined,
				undefined,
				maliciousTitle,
			);

			expect(html).not.toContain("</script><script>alert('pwned')");
			expect(html).toContain("\\u003c/script>");
		});

		it("should fallback to 'API Docs' when appName is empty", () => {
			const html = renderSwaggerUiHtml(undefined, undefined, undefined, "");
			expect(html).toContain("<title>API Docs</title>");
		});
	});
});
