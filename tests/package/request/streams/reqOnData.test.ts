// tests/streams/reqOnData.test.ts
import { describe, expect, it, vi } from "vitest";
import { reqOnData } from "../../../../package/core/http/streams/methods/request/reqOnData.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("reqOnData stream helper", () => {
    it("should attach listener and invoke it with converted Buffer chunks", async () => {
        const chunks: Buffer[] = [];
        const listener = vi.fn((buf: Buffer) => chunks.push(buf));
        const raw = createMockIncomingMessage({
            bodyChunks: [Buffer.from("part1"), "part2", new Uint8Array([1, 2, 3])],
        });

        const unsubscribe = reqOnData(raw, listener);

        await new Promise<void>((resolve) => {
            raw.on("end", () => resolve());
            raw.resume();
        });

        expect(listener).toHaveBeenCalledTimes(3);
        expect(Buffer.isBuffer(chunks[0])).toBe(true);
        expect(Buffer.isBuffer(chunks[1])).toBe(true);
        expect(Buffer.isBuffer(chunks[2])).toBe(true);
        expect(chunks[0].toString("utf-8")).toBe("part1");
        expect(chunks[1].toString("utf-8")).toBe("part2");
        expect(Array.from(chunks[2])).toEqual([1, 2, 3]);

        unsubscribe();
    });

    it("should unsubscribe listener when returned cleanup function is invoked", () => {
        const listener = vi.fn();
        const raw = createMockIncomingMessage();
        const unsubscribe = reqOnData(raw, listener);

        expect(raw.listenerCount("data")).toBe(1);
        unsubscribe();
        expect(raw.listenerCount("data")).toBe(0);
    });
});