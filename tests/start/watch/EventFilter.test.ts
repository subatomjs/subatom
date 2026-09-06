import { describe, it, expect } from "vitest";
import { EventFilter } from "../../../start/watch/EventFilter.js";

describe("EventFilter", () => {
	const allowedExtensions = ["ts", ".js", "JSON"];
	const ignoredPatterns = ["**/node_modules/**", "**/dist/**"];
	const filter = new EventFilter(allowedExtensions, ignoredPatterns);

	it("should accept valid extensions regardless of case and dots", () => {
		expect(filter.isExtensionAllowed("/app/index.ts")).toBe(true);
		expect(filter.isExtensionAllowed("/app/index.js")).toBe(true);
		expect(filter.isExtensionAllowed("/app/schema.json")).toBe(true);
		expect(filter.isExtensionAllowed("/app/schema.JSON")).toBe(true);
		expect(filter.isExtensionAllowed("/app/style.css")).toBe(false);
	});

	it("should detect ignored paths using glob-like patterns", () => {
		expect(filter.isPathIgnored("/project/node_modules/pkg/index.ts")).toBe(
			true,
		);
		expect(filter.isPathIgnored("C:\\project\\dist\\bundle.js")).toBe(true);
		expect(filter.isPathIgnored("/project/src/index.ts")).toBe(false);
	});

	it("should correctly evaluate shouldProcess", () => {
		expect(filter.shouldProcess("/project/src/server.ts")).toBe(true);
		expect(filter.shouldProcess("/project/node_modules/server.ts")).toBe(false);
		expect(filter.shouldProcess("/project/src/notes.txt")).toBe(false);
	});
});
