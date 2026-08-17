import { describe, expect, it } from "vitest";
import { deepMerge } from "../../../package/config/ConfigMerger.js";

describe("ConfigMerger (deepMerge)", () => {
	it("merges flat primitive objects left to right", () => {
		const objA = { a: 1, b: 2 };
		const objB = { b: 3, c: 4 };
		const result = deepMerge(objA, objB);
		expect(result).toEqual({ a: 1, b: 3, c: 4 });
	});

	it("deep merges nested objects recursively", () => {
		const target = {
			server: { host: "localhost", port: 3000 },
			logger: { level: "info" },
		};
		const source = {
			server: { port: 8080 },
		};
		const result = deepMerge(target, source);
		expect(result).toEqual({
			server: { host: "localhost", port: 8080 },
			logger: { level: "info" },
		});
	});

	it("replaces arrays entirely rather than concatenating", () => {
		const target = { tags: ["a", "b"] };
		const source = { tags: ["c"] };
		const result = deepMerge(target, source);
		expect(result.tags).toEqual(["c"]);
	});

	it("does not overwrite defined values with explicit undefined", () => {
		const target = { port: 8080, host: "localhost" };
		const source = { port: undefined };
		const result = deepMerge(target, source);
		expect(result).toEqual({ port: 8080, host: "localhost" });
	});

	it("skips falsy objects passed to arguments list", () => {
		const obj = { a: 1 };
		const result = deepMerge(
			obj,
			null as any,
			undefined as any,
			{ b: 2 } as any,
		);
		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("preserves Date and RegExp instances as terminal values", () => {
		const date = new Date("2026-01-01");
		const regex = /test/g;
		const result = deepMerge({}, { date, regex });
		expect(result.date).toBe(date);
		expect(result.regex).toBe(regex);
	});
});
