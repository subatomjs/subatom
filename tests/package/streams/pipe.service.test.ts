import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import { pipe } from "../../../package/core/http/streams/methods/stream-composition/pipe.js";

describe("pipe", () => {
    it("should pipe source to destination stream with options and return destination", () => {
        const source = new PassThrough();
        const destination = new PassThrough();
        const pipeSpy = vi.spyOn(source, "pipe");

        const result = pipe(source, destination, { end: false });

        expect(pipeSpy).toHaveBeenCalledWith(destination, { end: false });
        expect(result).toBe(destination);
    });
});