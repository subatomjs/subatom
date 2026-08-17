import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import { reqStream } from "../../../package/core/http/streams/methods/request/reqStream.js";

describe("reqStream", () => {
    it("should return the request stream if not destroyed", () => {
        const req = new PassThrough() as unknown as IncomingMessage;
        const stream = reqStream(req);
        expect(stream).toBe(req);
    });

    it("should throw error if request is already destroyed", () => {
        const req = new PassThrough() as unknown as IncomingMessage;
        req.destroyed = true;

        expect(() => reqStream(req)).toThrow(
            "[Subatom Stream Error]: Request stream has already been destroyed.",
        );
    });
});