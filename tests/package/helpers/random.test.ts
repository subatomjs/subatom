import { describe, expect, it, vi } from "vitest";
import { random } from "../../../package/core/helpers/framework/random.js";

describe("Random Utility", () => {
	describe("random() & random.int()", () => {
		it("returns cryptographically-strong integer when bounds are integers", () => {
			for (let i = 0; i < 50; i++) {
				const val = random(5, 10);
				expect(Number.isInteger(val)).toBe(true);
				expect(val).toBeGreaterThanOrEqual(5);
				expect(val).toBeLessThanOrEqual(10);
			}
		});

		it("returns float when bounds are non-integers", () => {
			const val = random(1.5, 5.5);
			expect(val).toBeGreaterThanOrEqual(1.5);
			expect(val).toBeLessThan(5.5);
		});

		it("random.int() returns integers strictly within [min, max] inclusive", () => {
			const min = 1;
			const max = 3;
			const seen = new Set<number>();

			for (let i = 0; i < 100; i++) {
				const res = random.int(min, max);
				expect(Number.isInteger(res)).toBe(true);
				expect(res).toBeGreaterThanOrEqual(min);
				expect(res).toBeLessThanOrEqual(max);
				seen.add(res);
			}

			expect(seen.has(1)).toBe(true);
			expect(seen.has(2)).toBe(true);
			expect(seen.has(3)).toBe(true);
		});
	});

	describe("random.string()", () => {
		it("generates string of specified length using default charset", () => {
			const res = random.string(32);
			expect(res).toHaveLength(32);
			expect(res).toMatch(/^[a-zA-Z0-9]{32}$/);
		});

		it("generates string using custom charset", () => {
			const customCharset = "ABC!@#";
			const res = random.string(20, customCharset);
			expect(res).toHaveLength(20);
			for (const char of res) {
				expect(customCharset).toContain(char);
			}
		});

		it("handles zero length", () => {
			expect(random.string(0)).toBe("");
		});
	});

	describe("random.bool()", () => {
		it("returns boolean based on probability", () => {
			const spy = vi.spyOn(Math, "random");

			spy.mockReturnValue(0.3);
			expect(random.bool(0.5)).toBe(true);

			spy.mockReturnValue(0.7);
			expect(random.bool(0.5)).toBe(false);

			spy.mockReturnValue(0.89);
			expect(random.bool(0.9)).toBe(true);

			spy.mockRestore();
		});
	});

	describe("random.item()", () => {
		it("picks an element present in the array", () => {
			const items = ["alpha", "beta", "gamma"] as const;
			for (let i = 0; i < 20; i++) {
				const item = random.item(items);
				expect(items).toContain(item);
			}
		});

		it("throws an error when called with an empty array", () => {
			expect(() => random.item([])).toThrow(
				"random.item() called with an empty array",
			);
		});
	});

	describe("random.shuffle()", () => {
		it("shuffles array elements without mutating the original array", () => {
			const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const originalCopy = [...original];

			const shuffled = random.shuffle(original);

			expect(shuffled).toHaveLength(original.length);
			expect(shuffled.sort((a, b) => a - b)).toEqual(originalCopy);
			expect(original).toEqual(originalCopy);
		});

		it("handles empty and single-element arrays", () => {
			expect(random.shuffle([])).toEqual([]);
			expect(random.shuffle([42])).toEqual([42]);
		});
	});
});
