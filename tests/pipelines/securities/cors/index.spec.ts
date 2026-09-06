import { describe, expect, it } from "vitest";
import { cors } from "../../../../packages/pipelines/securities/cors/index.js";
import { createCors } from "../../../../packages/pipelines/securities/cors/corsMiddleware.js";

describe("cors index export hub", () => {
	it("should re-export createCors as cors", () => {
		expect(cors).toBe(createCors);
	});
});