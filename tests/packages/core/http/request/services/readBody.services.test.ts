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

    it("should reject with BadRequestError when stream closes prematurely", async () => {
      const stream = createMockStream();
      const promise = readBuffer(stream);

      stream.emit("close");
      await expect(promise).rejects.toThrow(BadRequestError);
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