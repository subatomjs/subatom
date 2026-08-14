/// <reference types="node" />

import { describe, test, expect } from "vitest";
import { Readable, Writable, PassThrough } from "node:stream";
import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

// Module Imports
import { reqOnData } from "../package/core/http/streams/methods/request/reqOnData.js";
import { reqPipe } from "../package/core/http/streams/methods/request/reqPipe.js";
import { resStream } from "../package/core/http/streams/methods/response/resStream.js";
import { resSendStream } from "../package/core/http/streams/methods/response/resSendStream.js";
import { UploadFile } from "../package/core/pipeline/file-system/UploadFile.js";
import { pipeline } from "../package/core/http/streams/methods/stream-composition/pipeline.js";
import { createTransform } from "../package/core/http/streams/methods/stream-composition/Transform.js";

// ==========================================
// MOCK CREATORS
// ==========================================

function createMockRequest(chunks: string[] = []): IncomingMessage {
  let index = 0;
  const req = new Readable({
    read() {
      // Push asynchronously so event listeners attach before data flows
      process.nextTick(() => {
        if (index < chunks.length) {
          this.push(Buffer.from(chunks[index++] as string));
        } else {
          this.push(null); // Signal EOF
        }
      });
    },
  }) as unknown as IncomingMessage;

  req.headers = {};
  req.method = "GET";
  req.url = "/";
  return req;
}

function createMockResponse(): {
  res: ServerResponse;
  getOutput: () => string;
} {
  let output = "";
  const headers = new Map<string, string>();

  // Using PassThrough allows readable streams to pipe into `res` cleanly
  const resStreamPass = new PassThrough();

  const mockRes = resStreamPass as unknown as ServerResponse;

  mockRes.statusCode = 200;
  Object.defineProperty(mockRes, "headersSent", {
    value: false,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  mockRes.setHeader = (
    name: string,
    value: string | number | readonly string[],
  ): ServerResponse => {
    headers.set(name.toLowerCase(), String(value));
    return mockRes;
  };

  mockRes.getHeader = (name: string) => headers.get(name.toLowerCase());

  // Capture piped or direct output
  resStreamPass.on("data", (chunk: Buffer | string) => {
    output += chunk.toString();
  });

  return {
    res: mockRes,
    getOutput: () => output,
  };
}

// ==========================================
// UNIT TESTS
// ==========================================

describe("Subatom Basic Streaming Unit Tests", () => {
  describe("Request Stream Methods", () => {
    test("reqOnData should consume incoming chunks correctly", async () => {
      const req = createMockRequest(["Hello ", "World!"]);
      const receivedChunks: string[] = [];

      reqOnData(req, (chunk: Buffer) => {
        receivedChunks.push(chunk.toString());
      });

      await once(req, "end");
      expect(receivedChunks).toEqual(["Hello ", "World!"]);
    });

    test("reqPipe should channel request data directly into a Writable destination", async () => {
      const req = createMockRequest(["Subatom ", "Framework"]);
      let result = "";

      const destination = new Writable({
        write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
          result += chunk.toString();
          callback();
        },
      });

      reqPipe(req, destination);
      await once(destination, "finish");

      expect(result).toBe("Subatom Framework");
    });
  });

  describe("Response Stream Methods", () => {
    test("resStream should send readable stream data to mock response", async () => {
      const { res, getOutput } = createMockResponse();
      const sourceStream = Readable.from(["Data ", "Chunk ", "Test"]);

      resStream(res, sourceStream);

      await once(res as unknown as PassThrough, "finish");
      expect(getOutput()).toBe("Data Chunk Test");
      expect(res.writableEnded).toBe(true);
    });

    test("resSendStream should set headers and write stream output", async () => {
      const { res, getOutput } = createMockResponse();
      const sourceStream = Readable.from(['{"success":true}']);

      resSendStream(res, sourceStream, {
        contentType: "application/json",
        statusCode: 200,
      });

      await once(res as unknown as PassThrough, "finish");
      expect(res.statusCode).toBe(200);
      expect(getOutput()).toBe('{"success":true}');
    });
  });

  describe("UploadFile & In-Memory Handling", () => {
    test("UploadFile in memory mode should return readable stream and buffer content", async () => {
      const content = Buffer.from("Test File Content");
      const file = new UploadFile({
        filename: "test.txt",
        encoding: "7bit",
        mimetype: "text/plain",
        storageType: "memory",
        buffer: content,
        size: content.length,
      });

      expect(file.filename).toBe("test.txt");
      expect(file.destroyed).toBe(false);

      const bufferResult = await file.buffer();
      expect(bufferResult.toString()).toBe("Test File Content");

      // Verify Stream capability
      const stream = file.stream();
      let streamOutput = "";
      for await (const chunk of stream) {
        streamOutput += (chunk as Buffer).toString();
      }
      expect(streamOutput).toBe("Test File Content");

      // Test Cleanup
      await file.destroy();
      expect(file.destroyed).toBe(true);
      await expect(file.buffer()).rejects.toThrow();
    });
  });

  describe("Stream Composition Utilities", () => {
    test("createTransform should correctly modify stream data in pipeline", async () => {
      const source = Readable.from(["hello", "world"]);
      let result = "";

      const uppercaseTransform = createTransform<string | Buffer>(
        (chunk, _encoding, callback) => {
          callback(null, chunk.toString().toUpperCase() + " ");
        },
      );

      const destination = new Writable({
        write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
          result += chunk.toString();
          callback();
        },
      });

      await pipeline(source, uppercaseTransform, destination);
      expect(result).toBe("HELLO WORLD ");
    });
  });
});