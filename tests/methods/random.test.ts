import { describe, test, expect } from "vitest";
import { random } from "../../packages/methods/random.js";

describe("random utility", () => {
	describe("random() base function", () => {
		test("returns integer when both bounds are integers", () => {
			for (let i = 0; i < 50; i++) {
				const num = random(5, 10);
				expect(Number.isInteger(num)).toBe(true);
				expect(num).toBeGreaterThanOrEqual(5);
				expect(num).toBeLessThanOrEqual(10);
			}
		});

		test("defaults to [0, 1] integer range if no arguments provided", () => {
			const num = random();
			expect(Number.isInteger(num)).toBe(true);
			expect(num === 0 || num === 1).toBe(true);
		});

		test("returns float when bounds are floats", () => {
			const num = random(1.5, 4.5);
			expect(num).toBeGreaterThanOrEqual(1.5);
			expect(num).toBeLessThan(4.5);
		});
	});

	describe("random.int()", () => {
		test("generates bounded cryptographically strong integer", () => {
			for (let i = 0; i < 50; i++) {
				const val = random.int(10, 20);
				expect(Number.isInteger(val)).toBe(true);
				expect(val).toBeGreaterThanOrEqual(10);
				expect(val).toBeLessThanOrEqual(20);
			}
		});
	});

	describe("random.string()", () => {
		test("generates string with default length 16 and default charset", () => {
			const str = random.string();
			expect(str).toHaveLength(16);
			expect(/^[a-zA-Z0-9]+$/.test(str)).toBe(true);
		});

		test("supports custom length and custom charset", () => {
			const str = random.string(8, "ABC");
			expect(str).toHaveLength(8);
			expect(/^[ABC]+$/.test(str)).toBe(true);
		});
	});

	describe("random.bool()", () => {
		test("returns boolean values", () => {
			const result = random.bool();
			expect(typeof result).toBe("boolean");
		});

		test("respects 1.0 and 0.0 probabilities", () => {
			expect(random.bool(1)).toBe(true);
			expect(random.bool(0)).toBe(false);
		});
	});

	describe("random.item()", () => {
		test("selects an item from a non-empty array", () => {
			const items = ["first", "second", "third"] as const;
			const picked = random.item(items);
			expect(items).toContain(picked);
		});

		test("throws an error when called with an empty array", () => {
			expect(() => random.item([])).toThrow(
				"random.item() called with an empty array",
			);
		});
	});

	describe("random.shuffle()", () => {
		test("shuffles elements into a new array without mutating original", () => {
			const original = [1, 2, 3, 4, 5, 6, 7, 8];
			const copy = [...original];
			const shuffled = random.shuffle(original);

			expect(original).toEqual(copy);
			expect(shuffled).toHaveLength(original.length);
			expect(shuffled.sort()).toEqual(original.sort());
		});

		test("handles empty and single element arrays safely", () => {
			expect(random.shuffle([])).toEqual([]);
			expect(random.shuffle([42])).toEqual([42]);
		});
	});
});