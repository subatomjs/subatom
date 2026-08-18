import { describe, it, expect } from "vitest";
import { cors } from "../../package/core/securities/cross-origin/index.js";

describe("CORS Public Entrypoint (index.ts)", () => {
    it("should export the cors factory function aliased from createCors", () => {
        expect(cors).toBeDefined();
        expect(typeof cors).toBe("function");

        const middlewareInstance = cors();
        expect(typeof middlewareInstance).toBe("function");
    });
});