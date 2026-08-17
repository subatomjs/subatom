import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import { PassThrough } from "node:stream";
import { fileStream } from "../../../package/core/http/streams/methods/file/fileStream.js";

vi.mock("node:fs");

describe("fileStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error if target path does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    expect(() => fileStream("/invalid/path/file.txt")).toThrow(
      "[Subatom File Stream Error]: Target path does not exist: /invalid/path/file.txt",
    );
  });

  it("should create and return a ReadStream when file exists", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const fakeReadStream = new PassThrough();
    const createStreamSpy = vi
      .spyOn(fs, "createReadStream")
      .mockReturnValue(fakeReadStream as any);

    const options = { start: 0, end: 100, highWaterMark: 16384 };
    const stream = fileStream("/valid/path/file.txt", options);

    expect(createStreamSpy).toHaveBeenCalledWith(
      "/valid/path/file.txt",
      options,
    );
    expect(stream).toBe(fakeReadStream);
  });
});
