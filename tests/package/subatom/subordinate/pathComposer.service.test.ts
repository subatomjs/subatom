// tests/unit/subordinate/services/pathComposer.service.test.ts
import { describe, expect, it, vi } from "vitest";
import * as combinePathHelper from "../../../../package/core/bootstrap/subatom/helpers/combinePath.js";
import { appendPrefix } from "../../../../package/core/bootstrap/subatom/subordinate/services/pathComposer.service.js";

describe("pathComposer.service - appendPrefix", () => {
	it("should throw TypeError when segment is not a string", () => {
		// @ts-expect-error runtime type check
		expect(() => appendPrefix("/api", null)).toThrow(TypeError);
		// @ts-expect-error runtime type check
		expect(() => appendPrefix("/api", 123)).toThrow(
			"[Subatom] .prefix() expects a string argument.",
		);
	});

	it("should combine base prefix and segment correctly", () => {
		const spy = vi.spyOn(combinePathHelper, "combinePaths");
		const result = appendPrefix("/api", "/v1");

		expect(spy).toHaveBeenCalledWith("/api", "/v1");
		expect(typeof result).toBe("string");
		spy.mockRestore();
	});
});
