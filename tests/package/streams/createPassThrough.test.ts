import { describe, it, expect } from "vitest";
import { PassThrough as NodePassThrough } from "node:stream";
import {
  createPassThrough,
  PassThrough,
} from "../../../package/core/http/streams/methods/stream-composition/PassThrough.js";

describe("createPassThrough", () => {
  it("should create an instance of PassThrough stream", () => {
    const stream = createPassThrough();
    expect(stream).toBeInstanceOf(NodePassThrough);
  });

  it("should correctly forward options to PassThrough", () => {
    const stream = createPassThrough({ highWaterMark: 32 });
    expect(stream.readableHighWaterMark).toBe(32);
  });

  it("should re-export NodePassThrough", () => {
    expect(PassThrough).toBe(NodePassThrough);
  });
});
