// tests/services/readJson.service.test.ts
import { describe, expect, it } from "vitest";
import { BadRequestError } from "../../../../package/core/http/errors/Error.js";
import { readJson } from "../../../../package/core/http/request/services/readJson.service.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("readJson service", () => {
    it("should parse valid JSON body into typed object", async () => {
        const payload = { userId: 42, active: true, roles: ["admin", "member"] };
        const raw = createMockIncomingMessage({
            bodyChunks: [JSON.stringify(payload)],
        });

        const result = await readJson<typeof payload>(raw);
        expect(result).toEqual(payload);
    });

    it("should return empty object for empty or whitespace-only body", async () => {
        const emptyRaw = createMockIncomingMessage({ bodyChunks: [] });
        const whitespaceRaw = createMockIncomingMessage({ bodyChunks: ["   \n  "] });

        expect(await readJson(emptyRaw)).toEqual({});
        expect(await readJson(whitespaceRaw)).toEqual({});
    });

    it("should throw BadRequestError on malformed JSON payload with rawError details", async () => {
        const raw = createMockIncomingMessage({
            bodyChunks: ["{ invalid_json: true, "],
        });

        let thrownErr: any;
        try {
            await readJson(raw);
        } catch (err) {
            thrownErr = err;
        }

        expect(thrownErr).toBeInstanceOf(BadRequestError);
        expect(thrownErr.message).toBe("Invalid JSON payload provided in request body");
        expect(thrownErr.details).toHaveProperty("rawError");
    });
});