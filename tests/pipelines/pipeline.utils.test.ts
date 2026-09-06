import { describe, expect, it } from "vitest";
import { sortedByPriority } from "../../packages/pipelines/pipeline.types";

describe("sortedByPriority", () => {
	it("should sort items in ascending order of priority", () => {
		const items = [
			{ name: "high", priority: 10 },
			{ name: "low", priority: 1 },
			{ name: "medium", priority: 5 },
		];

		const sorted = sortedByPriority(items);

		expect(sorted).toEqual([
			{ name: "low", priority: 1 },
			{ name: "medium", priority: 5 },
			{ name: "high", priority: 10 },
		]);
	});

	it("should treat undefined priority as 0", () => {
		const items = [
			{ name: "positive", priority: 2 },
			{ name: "undefined-prio" },
			{ name: "negative", priority: -1 },
		];

		const sorted = sortedByPriority(items);

		expect(sorted).toEqual([
			{ name: "negative", priority: -1 },
			{ name: "undefined-prio" },
			{ name: "positive", priority: 2 },
		]);
	});

	it("should maintain stable sort order for items with the same priority", () => {
		const items = [
			{ id: 1, priority: 5 },
			{ id: 2, priority: 1 },
			{ id: 3, priority: 5 },
			{ id: 4, priority: 1 },
			{ id: 5, priority: 5 },
		];

		const sorted = sortedByPriority(items);

		expect(sorted).toEqual([
			{ id: 2, priority: 1 },
			{ id: 4, priority: 1 },
			{ id: 1, priority: 5 },
			{ id: 3, priority: 5 },
			{ id: 5, priority: 5 },
		]);
	});

	it("should maintain stable sort order when all priorities are undefined", () => {
		const items: Array<{ id: string; priority?: number }> = [
			{ id: "a" },
			{ id: "b" },
			{ id: "c" },
		];

		const sorted = sortedByPriority(items);

		expect(sorted).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
	});

	it("should return an empty array when given an empty array", () => {
		const result = sortedByPriority([]);
		expect(result).toEqual([]);
	});

	it("should not mutate the original array", () => {
		const original = [{ priority: 3 }, { priority: 1 }];
		const originalCopy = [...original];

		const sorted = sortedByPriority(original);

		expect(original).toEqual(originalCopy);
		expect(sorted).not.toBe(original);
	});
});
