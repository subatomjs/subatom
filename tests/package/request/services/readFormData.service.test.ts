// tests/services/readFormData.service.test.ts
import { describe, expect, it } from "vitest";
import { readFormData } from "../../../../package/core/http/request/services/readFormData.service.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("readFormData service", () => {
	it("should parse URL-encoded form data into URLSearchParams", async () => {
		const formDataString =
			"username=octocat&tags=vitest&tags=subatom&encoded=hello+world";
		const raw = createMockIncomingMessage({ bodyChunks: [formDataString] });

		const params = await readFormData(raw);
		expect(params).toBeInstanceOf(URLSearchParams);
		expect(params.get("username")).toBe("octocat");
		expect(params.getAll("tags")).toEqual(["vitest", "subatom"]);
		expect(params.get("encoded")).toBe("hello world");
	});
});
