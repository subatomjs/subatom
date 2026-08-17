// tests/unit/subordinate/services/tagValidator.service.test.ts
import { describe, expect, it } from "vitest";
import { collectTags } from "../../../../package/core/bootstrap/subatom/subordinate/services/tagValidator.service.js";

describe("tagValidator.service - collectTags", () => {
	it("should append valid string tags and trim whitespace", () => {
		const tags: string[] = [];
		collectTags(tags, "auth", "  admin  ", "v1");
		expect(tags).toEqual(["auth", "admin", "v1"]);
	});

	it("should handle nested arrays of tags with trimming", () => {
		const tags: string[] = [];
		collectTags(tags, ["auth", " users "], ["  billing "]);
		expect(tags).toEqual(["auth", "users", "billing"]);
	});

	it("should handle mixed flat and array arguments", () => {
		const tags: string[] = [];
		collectTags(tags, "auth", ["users", "internal"], "metrics");
		expect(tags).toEqual(["auth", "users", "internal", "metrics"]);
	});

	it("should ignore empty, whitespace-only, and non-string values", () => {
		const tags: string[] = [];
		collectTags(
			tags,
			"",
			"   ",
			// @ts-expect-error Testing runtime resilience
			null,
			undefined,
			123,
			["", "  ", "valid", null as unknown as string],
		);
		expect(tags).toEqual(["valid"]);
	});

	it("should not modify target array if no arguments are passed", () => {
		const tags: string[] = ["existing"];
		collectTags(tags);
		expect(tags).toEqual(["existing"]);
	});
});
