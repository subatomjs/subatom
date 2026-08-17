import { describe, expect, it } from "vitest";
import { slug } from "../../../package/core/helpers/framework/slug.js";

describe("Slug Utility", () => {
	it("converts basic strings to slug with default options", () => {
		expect(slug("Hello, World!")).toBe("hello-world");
		expect(slug("Node.js & TypeScript Framework")).toBe(
			"node-js-typescript-framework",
		);
	});

	it("normalizes and removes combining diacritical marks", () => {
		expect(slug("Café déjà vu")).toBe("cafe-deja-vu");
		expect(slug("Crème Brûlée à la mode")).toBe("creme-brulee-a-la-mode");
	});

	it("handles custom separators including regex special characters", () => {
		expect(slug("Custom Separator Test", { separator: "_" })).toBe(
			"custom_separator_test",
		);
		expect(slug("Regex Char Separator", { separator: "." })).toBe(
			"regex.char.separator",
		);
		expect(slug("Special Separator", { separator: "$" })).toBe(
			"special$separator",
		);
	});

	it("respects lowercase option", () => {
		expect(slug("CamelAndPascalCase", { lowercase: false })).toBe(
			"CamelAndPascalCase",
		);
		expect(slug("Hello World", { lowercase: false })).toBe("Hello-World");
	});

	it("truncates to maxLength and removes trailing separators", () => {
		expect(slug("super-long-identifier-string", { maxLength: 10 })).toBe(
			"super-long",
		);
		expect(slug("super-long-identifier-string", { maxLength: 11 })).toBe(
			"super-long",
		);
	});

	it("collapses multiple consecutive separators and trims boundaries", () => {
		expect(slug("---leading trailing and --- inside---")).toBe(
			"leading-trailing-and-inside",
		);
		expect(slug("///special///symbols///", { separator: "/" })).toBe(
			"special/symbols",
		);
	});

	it("handles empty string input", () => {
		expect(slug("")).toBe("");
	});
});
