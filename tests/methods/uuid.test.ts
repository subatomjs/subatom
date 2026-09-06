import { describe, test, expect } from "vitest";
import { uuid } from "../../packages/methods/uuid.js";

describe("uuid utility", () => {
	test("generates RFC 4122 v4 UUID", () => {
		const id = uuid();
		expect(uuid.isValid(id)).toBe(true);
	});

	test("aliases uuid.v4 to uuid", () => {
		expect(uuid.v4).toBe(uuid);
		expect(uuid.isValid(uuid.v4())).toBe(true);
	});

	describe("uuid.short()", () => {
		test("generates random hex ID with default length 8", () => {
			const id = uuid.short();
			expect(id).toHaveLength(8);
			expect(/^[0-9a-f]+$/i.test(id)).toBe(true);
		});

		test("supports custom lengths (even and odd)", () => {
			expect(uuid.short(5)).toHaveLength(5);
			expect(uuid.short(12)).toHaveLength(12);
		});
	});

	describe("uuid.isValid()", () => {
		test("returns true for valid v4 UUIDs", () => {
			expect(uuid.isValid("c9a646d3-9c61-4cc9-bc53-ae82f1b07f1a")).toBe(true);
		});

		test("returns false for invalid UUID strings", () => {
			expect(uuid.isValid("invalid-uuid")).toBe(false);
			expect(uuid.isValid("")).toBe(false);
			expect(uuid.isValid("c9a646d3-9c61-1cc9-bc53-ae82f1b07f1a")).toBe(false); // v1
			expect(uuid.isValid("c9a646d3-9c61-4cc9-5c53-ae82f1b07f1a")).toBe(false); // invalid variant
		});
	});
});