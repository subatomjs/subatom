import { describe, test, expect } from "vitest";
import { slug } from "../../packages/methods/slug.js";

describe("slug utility", () => {
	test("converts simple string to slug with default settings", () => {
		expect(slug("Hello World")).toBe("hello-world");
	});

	test("strips diacritics and accents", () => {
		expect(slug("Café déjà vu")).toBe("cafe-deja-vu");
		expect(slug("München Über")).toBe("munchen-uber");
	});

	test("replaces special characters and removes duplicates", () => {
		expect(slug("Node.js & TypeScript!!")).toBe("node-js-typescript");
	});

	test("trims leading and trailing separators", () => {
		expect(slug("---leading and trailing---")).toBe("leading-and-trailing");
	});

	test("supports custom separator and regex escape characters", () => {
		expect(slug("custom separator text", { separator: "_" })).toBe(
			"custom_separator_text",
		);
		expect(slug("dots in here", { separator: "." })).toBe("dots.in.here");
	});

	test("preserves casing when lowercase option is false", () => {
		expect(slug("MixedCase Title", { lowercase: false })).toBe(
			"MixedCase-Title",
		);
	});

	test("truncates to maxLength and removes trailing delimiter", () => {
		expect(slug("a very long title that should be shortened", { maxLength: 10 })).toBe(
			"a-very-lon",
		);
		expect(slug("short-slug-text", { maxLength: 6 })).toBe("short");
	});
});