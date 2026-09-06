/// <reference types="node" />
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { describe, it, expect, vi } from "vitest";
import { bindAbortSignal, onClientDisconnect } from "../../../../../../packages/core/http/streams/utils/abort.utils.js";
import { writeWithBackpressure } from "../../../../../../packages/core/http/streams/utils/backpressure.utils.js";

interface MockResponseFixture {
  raw: ServerResponse;
  state: {
    writableEnded: boolean;
    destroyed: boolean;
  };
}

function createMockResponse(): MockResponseFixture {
  const state = { writableEnded: false, destroyed: false };
  const emitter = new EventEmitter();
  const raw = Object.assign(emitter, {
    write: vi.fn(),
    off: emitter.removeListener.bind(emitter),
  }) as unknown as ServerResponse;

  Object.defineProperty(raw, "writableEnded", {
    get: () => state.writableEnded,
  });
  Object.defineProperty(raw, "destroyed", {
    get: () => state.destroyed,
  });

  return { raw, state };
}

describe("Stream Utils", () => {
  describe("bindAbortSignal", () => {
    it("should return a no-op if signal is undefined", () => {
      const onAbort = vi.fn();
      const unbind = bindAbortSignal(undefined, onAbort);
      expect(typeof unbind).toBe("function");
      unbind();
      expect(onAbort).not.toHaveBeenCalled();
    });

    it("should immediately fire callback if signal is already aborted", () => {
      const controller = new AbortController();
      controller.abort();
      const onAbort = vi.fn();

      bindAbortSignal(controller.signal, onAbort);
      expect(onAbort).toHaveBeenCalledTimes(1);
    });

    it("should trigger callback once when signal aborts later", () => {
      const controller = new AbortController();
      const onAbort = vi.fn();
      const unbind = bindAbortSignal(controller.signal, onAbort);

      controller.abort();
      expect(onAbort).toHaveBeenCalledTimes(1);
      unbind();
    });

    it("should allow unbinding before abort occurs", () => {
      const controller = new AbortController();
      const onAbort = vi.fn();
      const unbind = bindAbortSignal(controller.signal, onAbort);

      unbind();
      controller.abort();
      expect(onAbort).not.toHaveBeenCalled();
    });
  });

  describe("onClientDisconnect", () => {
    it("should fire callback when close is emitted before response ends", () => {
      const { raw } = createMockResponse();
      const onDisconnect = vi.fn();

      onClientDisconnect(raw, onDisconnect);
      raw.emit("close");

      expect(onDisconnect).toHaveBeenCalledTimes(1);
    });

    it("should not fire callback if response writableEnded is already true", () => {
      const { raw, state } = createMockResponse();
      state.writableEnded = true;
      const onDisconnect = vi.fn();

      onClientDisconnect(raw, onDisconnect);
      raw.emit("close");

      expect(onDisconnect).not.toHaveBeenCalled();
    });

    it("should remove close listener when unbind is invoked", () => {
      const { raw } = createMockResponse();
      const onDisconnect = vi.fn();
      const unbind = onClientDisconnect(raw, onDisconnect);

      unbind();
      raw.emit("close");

      expect(onDisconnect).not.toHaveBeenCalled();
    });
  });

  describe("writeWithBackpressure", () => {
    it("should reject immediately if response is already ended or destroyed", async () => {
      const { raw, state } = createMockResponse();
      state.writableEnded = true;

      await expect(writeWithBackpressure(raw, "chunk")).rejects.toThrow(
        "Cannot write: response already ended",
      );

      state.writableEnded = false;
      state.destroyed = true;
      await expect(writeWithBackpressure(raw, "chunk")).rejects.toThrow(
        "Cannot write: response already ended",
      );
    });

    it("should resolve immediately when raw.write returns true", async () => {
      const { raw } = createMockResponse();
      vi.mocked(raw.write).mockReturnValue(true);

      await expect(writeWithBackpressure(raw, "chunk")).resolves.toBeUndefined();
    });

    it("should wait for drain event when raw.write returns false", async () => {
      const { raw } = createMockResponse();
      vi.mocked(raw.write).mockReturnValue(false);

      const promise = writeWithBackpressure(raw, "heavy-chunk");
      let resolved = false;
      promise.then(() => {
        resolved = true;
      });

      await new Promise((res) => setTimeout(res, 10));
      expect(resolved).toBe(false);

      raw.emit("drain");
      await promise;
      expect(resolved).toBe(true);
    });

    it("should reject when socket emits an error or write callback fails", async () => {
      const { raw } = createMockResponse();
      vi.mocked(raw.write).mockImplementation((_chunk, cb) => {
        if (typeof cb === "function") {
          (cb as (error: Error) => void)(new Error("Write failure"));
        }
        return false;
      });

      await expect(writeWithBackpressure(raw, "chunk")).rejects.toThrow(
        "Write failure",
      );
    });

    it("should reject when response closes or aborts prior to completion", async () => {
      const { raw } = createMockResponse();
      vi.mocked(raw.write).mockReturnValue(false);

      const promiseClose = writeWithBackpressure(raw, "chunk");
      raw.emit("close");
      await expect(promiseClose).rejects.toThrow(
        "Response closed before the write completed",
      );

      const promiseAbort = writeWithBackpressure(raw, "chunk");
      raw.emit("aborted");
      await expect(promiseAbort).rejects.toThrow(
        "Response aborted before the write completed",
      );
    });
  });
});