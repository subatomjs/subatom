// tests/services/readText.service.test.ts
import { describe, expect, it } from "vitest";
import { readText } from "../../../../package/core/http/request/services/readText.service.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("readText service", () => {
    it("should decode incoming buffer chunks into utf-8 string", async () => {
        const raw = createMockIncomingMessage({
            bodyChunks: ["Subatom ", "Framework ⚡"],
        });

        const text = await readText(raw);
        expect(text).toBe("Subatom Framework ⚡");
    });
});