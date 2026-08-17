import { describe, it, expect, vi } from "vitest";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "../../../package/core/http/streams/methods/stream-composition/pipeline.js";

describe("pipeline", () => {
    it("should throw error if fewer than 2 streams are passed", async () => {
        const singleStream = new PassThrough();

        await expect(pipeline(singleStream)).rejects.toThrow(
            "[Subatom Pipeline Error]: Pipeline requires at least 2 stream parameters.",
        );
    });

    it("should successfully pipe through multiple streams", async () => {
        const source = Readable.from(["foo", "bar", "baz"]);
        const upper = new Transform({
            transform(chunk, _, cb) {
                cb(null, chunk.toString().toUpperCase());
            },
        });
        const sink = new PassThrough();

        const chunks: string[] = [];
        sink.on("data", (c) => chunks.push(c.toString()));

        await pipeline(source, upper, sink);

        expect(chunks.join("")).toBe("FOOBARBAZ");
    });

    it("should handle error in the pipeline stream lifecycle", async () => {
        const source = new PassThrough();
        const brokenTransform = new Transform({
            transform() {
                throw new Error("Transform pipeline error");
            },
        });
        const sink = new PassThrough();

        const promise = pipeline(source, brokenTransform, sink);
        source.write("data");

        await expect(promise).rejects.toThrow("Transform pipeline error");
    });
});