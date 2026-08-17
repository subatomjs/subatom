// tests/streams/reqPipe.test.ts
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { reqPipe } from  "../../../../package/core/http/streams/methods/request/reqPipe.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("reqPipe stream helper", () => {
    it("should pipe request chunks directly into destination writable stream", async () => {
        const raw = createMockIncomingMessage({ bodyChunks: ["hello", " ", "pipe"] });
        const destination = new PassThrough();

        const pipedResult = reqPipe(raw, destination);
        expect(pipedResult).toBe(destination);

        const chunks: Buffer[] = [];
        destination.on("data", (c) => chunks.push(Buffer.from(c)));

        await new Promise<void>((resolve) => destination.on("end", resolve));

        expect(Buffer.concat(chunks).toString("utf-8")).toBe("hello pipe");
    });
});