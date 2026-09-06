import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import { describe, it, expect } from "vitest";
import { readBuffer } from "../../../../../../packages/core/http/request/services/readBuffer.service.js";
import { readText } from "../../../../../../packages/core/http/request/services/readText.service.js";
import { readJson } from "../../../../../../packages/core/http/request/services/readJson.service.js";
import { readFormData } from "../../../../../../packages/core/http/request/services/readFormData.service.js";
import {
  BadRequestError,
  PayloadTooLargeError,
} from "../../../../../../packages/errors/Errors.js";

function createMockStream(): PassThrough & IncomingMessage {
  const stream = new PassThrough();
  return stream as unknown as PassThrough & IncomingMessage;
}

describe("Body Reader Services", () => {
  describe("readBuffer", () => {
    it("should aggregate data chunks into a single Buffer", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.write(Buffer.from("Hello "));
      stream.write(Buffer.from("World"));
      stream.end();

      const result = await promise;
      expect(result.toString("utf-8")).toBe("Hello World");
    });

    it("should use default 10MB limit when limitInBytes is omitted", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.write(Buffer.from("default limit check"));
      stream.end();

      const res = await promise;
      expect(res.toString()).toBe("default limit check");
    });

    it("should accumulate multiple chunks under limit without failing", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream, 100);

      stream.write(Buffer.from("chunk-1-"));
      stream.write(Buffer.from("chunk-2-"));
      stream.write(Buffer.from("chunk-3"));
      stream.end();

      const result = await promise;
      expect(result.toString()).toBe("chunk-1-chunk-2-chunk-3");
    });

    it("should reject with PayloadTooLargeError if byte limit is exceeded", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream, 10);

      stream.write(Buffer.from("This chunk exceeds ten bytes"));
      stream.end();

      await expect(promise).rejects.toThrow(PayloadTooLargeError);
    });

    it("should reject with BadRequestError on stream errors", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.emit("error", new Error("Socket error"));
      await expect(promise).rejects.toThrow(BadRequestError);
    });

    it("should reject with BadRequestError when stream aborts", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.emit("aborted");
      await expect(promise).rejects.toThrow(BadRequestError);
    });

    it("should reject with BadRequestError when stream closes prematurely without settling", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.emit("close");
      await expect(promise).rejects.toThrow(BadRequestError);
    });

    it("should ignore subsequent chunks and errors after payload size limit exceeded", async () => {
      const stream = createMockStream();
      stream.on("error", () => {});

      const promise = readBuffer(stream, 5);

      stream.write(Buffer.from("123456"));
      stream.write(Buffer.from("789"));
      stream.emit("close");
      stream.emit("error", new Error("post-limit error"));
      stream.end();

      await expect(promise).rejects.toThrow(PayloadTooLargeError);
    });

    it("should handle fail() called multiple times idempotently", async () => {
      const stream = createMockStream();
      stream.on("error", () => {});

      const promise = readBuffer(stream);

      stream.emit("error", new Error("Initial failure"));
      stream.emit("close");
      stream.emit("aborted");

      await expect(promise).rejects.toThrow("Failed to read request stream: Initial failure");
    });

    it("should hit settled guard when onData and onEnd fire after abort", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.emit("aborted");
      await expect(promise).rejects.toThrow("Request aborted");

      stream.emit("data", Buffer.from("chunk after settled"));
      stream.emit("end");
    });

    it("should not fail onClose if already settled normally", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.write(Buffer.from("success"));
      stream.end();

      await promise;
      stream.emit("close");
    });

    it("should ignore events after stream has settled normally", async () => {
      const stream = createMockStream();
      stream.on("error", () => {});

      const promise = readBuffer(stream);

      stream.write(Buffer.from("settle guard"));
      stream.end();

      await promise;

      stream.emit("data", Buffer.from("ignored"));
      stream.emit("end");
      stream.emit("close");
      stream.emit("error", new Error("late error"));
    });

    it("should ignore repeated failure and close events after settlement", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);
      const errorHandler = stream.listeners("error")[0] as (error: Error) => void;
      const closeHandler = stream.listeners("close")[0] as () => void;

      errorHandler(new Error("first failure"));
      errorHandler(new Error("second failure"));
      closeHandler();

      await expect(promise).rejects.toThrow("first failure");
    });

    it("should ignore data and end callbacks after a payload limit failure", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream, 1);
      const dataHandler = stream.listeners("data")[0] as (chunk: Buffer) => void;
      const endHandler = stream.listeners("end")[0] as () => void;

      dataHandler(Buffer.from("too large"));
      dataHandler(Buffer.from("ignored"));
      endHandler();

      await expect(promise).rejects.toThrow(PayloadTooLargeError);
    });

    it("should use the fallback message when a stream error has no message", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.emit("error", {} as Error);

      await expect(promise).rejects.toThrow(
        "Failed to read request stream: undefined",
      );
    });
  });

  describe("readText", () => {
    it("should return string content decoded as UTF-8", async () => {
      const stream = createMockStream();
      const promise = readText(stream);

      stream.write(Buffer.from("UTF-8 text payload"));
      stream.end();

      expect(await promise).toBe("UTF-8 text payload");
    });
  });

  describe("readJson", () => {
    it("should parse valid JSON objects", async () => {
      const stream = createMockStream();
      const promise = readJson<{ success: boolean }>(stream);

      stream.write(Buffer.from(JSON.stringify({ success: true })));
      stream.end();

      expect(await promise).toEqual({ success: true });
    });

    it("should return an empty object for empty body strings", async () => {
      const stream = createMockStream();
      const promise = readJson(stream);

      stream.write(Buffer.from("   "));
      stream.end();

      expect(await promise).toEqual({});
    });

    it("should throw BadRequestError on invalid JSON syntax", async () => {
      const stream = createMockStream();
      const promise = readJson(stream);

      stream.write(Buffer.from("{ invalid json }"));
      stream.end();

      await expect(promise).rejects.toThrow(BadRequestError);
    });
  });

  describe("readFormData", () => {
    it("should parse URL-encoded body into URLSearchParams", async () => {
      const stream = createMockStream();
      const promise = readFormData(stream);

      stream.write(Buffer.from("name=subatom&version=2.0.1"));
      stream.end();

      const params = await promise;
      expect(params.get("name")).toBe("subatom");
      expect(params.get("version")).toBe("2.0.1");
    });
  });
});