import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { PassThrough, Readable, Transform } from "node:stream";
import { describe, it, expect, vi } from "vitest";
import {
  composePipeline,
  pipeToResponse,
} from "../../../../../../packages/core/http/streams/services/pipeline.service.js";
import { StreamAbortedError } from "../../../../../../packages/core/http/streams/types/stream.types.js";

interface MockServerResponseFixture {
  raw: ServerResponse;
  state: {
    headersSent: boolean;
    writableEnded: boolean;
    destroyed: boolean;
  };
}

function createMockResponse(): MockServerResponseFixture {
  const state = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
  };

  const emitter = new EventEmitter();
  const raw = Object.assign(emitter, {
    write: vi.fn((_chunk, cb) => {
      if (typeof cb === "function") cb();
      return true;
    }),
    end: vi.fn((cb) => {
      state.writableEnded = true;
      if (typeof cb === "function") cb();
      raw.emit("finish");
      return raw;
    }),
    destroy: vi.fn((err?: Error) => {
      state.destroyed = true;
      raw.emit("close");
      return raw;
    }),
    off: emitter.removeListener.bind(emitter),
  }) as unknown as ServerResponse;

  Object.defineProperty(raw, "headersSent", {
    get: () => state.headersSent,
  });
  Object.defineProperty(raw, "writableEnded", {
    get: () => state.writableEnded,
  });
  Object.defineProperty(raw, "destroyed", {
    get: () => state.destroyed,
  });

  return { raw, state };
}

describe("pipeline.service", () => {
  describe("pipeToResponse", () => {
    it("should pipe readable stream to response and call onFinish", async () => {
      const { raw } = createMockResponse();
      const source = Readable.from(["subatom", "streaming"]);
      const onFinish = vi.fn();

      await pipeToResponse(raw, source, { onFinish });
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it("should handle client cancellation gracefully and invoke onError with StreamAbortedError", async () => {
      const { raw } = createMockResponse();
      const source = new PassThrough();
      const onError = vi.fn();

      const controller = new AbortController();
      const promise = pipeToResponse(raw, source, {
        signal: controller.signal,
        onError,
      });

      controller.abort();
      await promise;

      expect(onError).toHaveBeenCalledWith(expect.any(StreamAbortedError));
    });

    it("should rethrow source errors when headers have not been sent", async () => {
      const { raw, state } = createMockResponse();
      state.headersSent = false;
      const source = new PassThrough();
      const testError = new Error("Source read failure");

      const promise = pipeToResponse(raw, source);
      source.destroy(testError);

      await expect(promise).rejects.toThrow("Source read failure");
    });

    it("should destroy response socket without rethrowing when headers are already sent", async () => {
      const { raw, state } = createMockResponse();
      state.headersSent = true;
      const source = new PassThrough();
      const onError = vi.fn();

      const promise = pipeToResponse(raw, source, { onError });
      source.destroy(new Error("Mid-stream failure"));

      await promise;
      expect(onError).toHaveBeenCalled();
      expect(raw.destroy).toHaveBeenCalled();
    });
  });

  describe("composePipeline", () => {
    it("should return the source unchanged when no transforms are passed", () => {
      const source = new PassThrough();
      expect(composePipeline(source)).toBe(source);
    });

    it("should pipe through multiple transforms and propagate upstream errors", () => {
      const source = new PassThrough();
      const t1 = new Transform({
        transform(chunk, _enc, cb) {
          cb(null, chunk.toString().toUpperCase());
        },
      });
      const t2 = new Transform({
        transform(chunk, _enc, cb) {
          cb(null, `[${chunk.toString()}]`);
        },
      });

      const composed = composePipeline(source, t1, t2);
      expect(composed).toBe(t2);

      // Prevent unhandled error event on the stream pipeline tail
      composed.on("error", () => {});

      const err = new Error("Upstream pipe broke");
      source.emit("error", err);
      expect(t1.destroyed).toBe(true);
    });
  });
});