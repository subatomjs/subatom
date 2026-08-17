// tests/streams/reqOnEnd.test.ts
import { describe, expect, it, vi } from "vitest";
import { reqOnEnd } from "../../../../package/core/http/streams/methods/request/reqOnEnd.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("reqOnEnd stream helper", () => {
    it("should trigger listener once when stream ends", async () => {
        const endSpy = vi.fn();
        const raw = createMockIncomingMessage({ bodyChunks: ["done"] });

        reqOnEnd(raw, endSpy);

        await new Promise<void>((resolve) => {
            raw.on("end", () => resolve());
            raw.resume();
        });

        expect(endSpy).toHaveBeenCalledTimes(1);
    });

    it("should unsubscribe listener cleanly before emission", () => {
        const endSpy = vi.fn();
        const raw = createMockIncomingMessage();
        const unsubscribe = reqOnEnd(raw, endSpy);

        expect(raw.listenerCount("end")).toBe(1);
        unsubscribe();
        expect(raw.listenerCount("end")).toBe(0);
    });
});