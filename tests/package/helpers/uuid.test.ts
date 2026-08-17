import { describe, expect, it } from "vitest";
import { uuid } from "../../../package/core/helpers/framework/uuid.js";

describe("UUID Utility", () => {
    describe("uuid() & uuid.v4()", () => {
        it("generates a valid RFC 4122 v4 UUID string", () => {
            const id = uuid();
            expect(typeof id).toBe("string");
            expect(uuid.isValid(id)).toBe(true);
        });

        it("uuid.v4 is an alias for uuid", () => {
            expect(uuid.v4).toBe(uuid);
            const id = uuid.v4();
            expect(uuid.isValid(id)).toBe(true);
        });

        it("generates unique UUID values across repeated calls", () => {
            const set = new Set<string>();
            for (let i = 0; i < 100; i++) {
                set.add(uuid());
            }
            expect(set.size).toBe(100);
        });
    });

    describe("uuid.short()", () => {
        it("generates hex string of default length 8", () => {
            const shortId = uuid.short();
            expect(shortId).toHaveLength(8);
            expect(shortId).toMatch(/^[0-9a-f]{8}$/);
        });

        it("generates hex string of custom length", () => {
            const shortId10 = uuid.short(10);
            const shortId15 = uuid.short(15);
            expect(shortId10).toHaveLength(10);
            expect(shortId15).toHaveLength(15);
            expect(shortId10).toMatch(/^[0-9a-f]{10}$/);
            expect(shortId15).toMatch(/^[0-9a-f]{15}$/);
        });

        it("generates unique short ids", () => {
            const set = new Set<string>();
            for (let i = 0; i < 100; i++) {
                set.add(uuid.short(16));
            }
            expect(set.size).toBe(100);
        });
    });

    describe("uuid.isValid()", () => {
        it("returns true for valid RFC 4122 v4 UUIDs", () => {
            expect(
                uuid.isValid("a3bb189e-8bf9-4888-9912-ace4e6543002"),
            ).toBe(true);
            expect(
                uuid.isValid("A3BB189E-8BF9-4888-9912-ACE4E6543002"),
            ).toBe(true);
        });

        it("returns false for invalid UUIDs or non-v4 identifiers", () => {
            expect(uuid.isValid("not-a-uuid")).toBe(false);
            expect(uuid.isValid("")).toBe(false);
            // v1 format (time-based, version digit 1)
            expect(
                uuid.isValid("6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
            ).toBe(false);
            // Malformed length
            expect(
                uuid.isValid("a3bb189e-8bf9-4888-9912-ace4e654300"),
            ).toBe(false);
        });
    });
});