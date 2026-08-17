// tests/streams/reqStream.test.ts
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { reqStream } from "../../../../package/core/http/streams/methods/request/reqStream.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("reqStream stream helper", () => {
    it("should return the raw stream as a Readable instance", () => {
        const raw = createMockIncomingMessage();
        const readable = reqStream(raw);
        expect(readable).toBeInstanceOf(Readable);
        expect(readable).toBe(raw);
    });
});