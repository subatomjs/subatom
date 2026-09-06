import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resEnd } from "../../../../../../packages/core/http/streams/methods/response/resEnd.js";
import { resSendStream } from "../../../../../../packages/core/http/streams/methods/response/resSendStream.js";
import { resStream } from "../../../../../../packages/core/http/streams/methods/response/resStream.js";
import { resWrite } from "../../../../../../packages/core/http/streams/methods/response/resWrite.js";

interface ResponseState {
  headersSent: boolean;
  writableEnded: boolean;
  writableFinished: boolean;
  finished: boolean;
  statusCode: number;
  headers: Map<string, string>;
  destroyedWith: Error | undefined;
}

interface ResponseFixture {
  response: ServerResponse;
  state: ResponseState;
  end: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
}

function createResponse(): ResponseFixture {
  const state: ResponseState = {
    headersSent: false,
    writableEnded: false,
    writableFinished: false,
    finished: false,
    statusCode: 200,
    headers: new Map(),
    destroyedWith: undefined,
  };
  const writable = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const destroyWritable = writable.destroy.bind(writable);
  const end = vi.fn(function (this: Writable, _chunk?: unknown) {
    return this;
  });
  const write = vi.fn((_chunk?: unknown, _enc?: unknown, cb?: unknown) => {
    if (typeof cb === "function") cb();
    return true;
  });
  const setHeader = vi.fn((name: string, value: string) => {
    state.headers.set(name.toLowerCase(), value);
  });
  Object.defineProperties(writable, {
    headersSent: { configurable: true, get: () => state.headersSent },
    writableEnded: { configurable: true, get: () => state.writableEnded },
    writableFinished: { configurable: true, get: () => state.writableFinished },
    finished: { configurable: true, get: () => state.finished },
    statusCode: {
      configurable: true,
      get: () => state.statusCode,
      set: (value: number) => {
        state.statusCode = value;
      },
    },
  });
  const response = Object.assign(writable, {
    end,
    write,
    setHeader,
    destroy(error?: Error) {
      state.destroyedWith = error;
      return destroyWritable(error);
    },
  }) as unknown as ServerResponse;

  return { response, state, end, write, setHeader };
}

function streamError(message: string, code?: string): Error {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("response stream methods", () => {
  it("destroys an unread stream when the response has already ended", async () => {
    const { response } = createResponse();
    const readable = new Readable({ read() {} });
    const destroySpy = vi.spyOn(readable, "destroy");
    Object.defineProperty(response, "writableEnded", { value: true });

    await resStream(response, readable);

    expect(destroySpy).toHaveBeenCalledOnce();
  });

  it("reports stream errors through the supplied error callback", async () => {
    const { response } = createResponse();
    const readable = new Readable({
      read() {
        this.destroy(streamError("read failure"));
      },
    });
    const onError = vi.fn<(error: Error) => void>();

    await resStream(response, readable, { onError });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "read failure" }),
    );
  });

  it("ignores a client close that destroys the active readable stream", async () => {
    const { response } = createResponse();
    const request = new EventEmitter();
    const readable = new Readable({ read() {} });
    const closeHandler = () =>
      readable.destroy(
        streamError("client closed", "ERR_STREAM_PREMATURE_CLOSE"),
      );
    request.once("close", closeHandler);
    const completion = resStream(response, readable);

    request.emit("close");
    await completion;

    expect(readable.destroyed).toBe(true);
    expect(response.destroyed).toBe(true);
    expect(request.listenerCount("close")).toBe(0);
  });

  it("writes a 500 response before headers and destroys an active response after headers", async () => {
    const beforeHeaders = createResponse();
    const afterHeaders = createResponse();
    afterHeaders.state.headersSent = true;
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await resStream(
      beforeHeaders.response,
      Readable.from(["chunk", Promise.reject(streamError("before headers"))]),
    );
    await resStream(
      afterHeaders.response,
      new Readable({
        read() {
          this.destroy(streamError("after headers"));
        },
      }),
    );

    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(beforeHeaders.state.statusCode).toBe(500);
    expect(beforeHeaders.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/json",
    );
    expect(beforeHeaders.end).toHaveBeenCalledWith(
      JSON.stringify({ error: "Internal Server Error" }),
    );
    expect(afterHeaders.state.destroyedWith).toMatchObject({
      message: "after headers",
    });
  });

  it("does not destroy the response if it is already writableEnded when an error occurs after headers are sent", async () => {
    const { response, state } = createResponse();
    state.headersSent = true;
    state.writableEnded = true;
    const destroySpy = vi.spyOn(response, "destroy");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const readable = new Readable({
      read() {
        this.destroy(streamError("error after ended"));
      },
    });

    await resStream(response, readable);

    expect(destroySpy).not.toHaveBeenCalled();
  });

  it("returns early for ended responses and normalizes both resEnd callback overloads", () => {
    const ended = createResponse();
    ended.state.finished = true;
    const callbackOnly = vi.fn();
    const callbackWithChunk = vi.fn();
    const callbackWithEncoding = vi.fn();

    resEnd(ended.response, "ignored");
    Reflect.apply(resEnd, undefined, [ended.response, callbackOnly]);
    Reflect.apply(resEnd, undefined, [
      ended.response,
      "payload",
      callbackWithChunk,
    ]);
    resEnd(ended.response, "encoded", "utf8", callbackWithEncoding);

    expect(ended.end).not.toHaveBeenCalled();
    const active = createResponse();
    Reflect.apply(resEnd, undefined, [active.response, callbackOnly]);
    Reflect.apply(resEnd, undefined, [
      active.response,
      "payload",
      callbackWithChunk,
    ]);
    resEnd(active.response, "encoded", "utf8", callbackWithEncoding);
    expect(active.end).toHaveBeenNthCalledWith(
      1,
      undefined,
      "utf-8",
      callbackOnly,
    );
    expect(active.end).toHaveBeenNthCalledWith(
      2,
      "payload",
      "utf-8",
      callbackWithChunk,
    );
    expect(active.end).toHaveBeenNthCalledWith(
      3,
      "encoded",
      "utf8",
      callbackWithEncoding,
    );
  });

  it("rejects sent headers and handles send-stream errors before and after headers", () => {
    const sent = createResponse();
    sent.state.headersSent = true;
    const beforeHeaders = createResponse();
    const afterHeaders = createResponse();
    const beforeStream = new Readable({ read() {} });
    const afterStream = new Readable({ read() {} });
    afterHeaders.response.once("error", () => undefined);

    expect(() => resSendStream(sent.response, Readable.from([]))).toThrow(
      "Headers already sent",
    );
    resSendStream(beforeHeaders.response, beforeStream, {
      contentType: "text/plain",
      contentLength: 0,
      statusCode: 0,
    });
    beforeStream.emit("error", streamError("before send"));
    resSendStream(afterHeaders.response, afterStream);
    afterHeaders.state.headersSent = true;
    afterStream.emit("error", streamError("after send"));

    expect(beforeHeaders.state.statusCode).toBe(500);
    expect(beforeHeaders.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/plain",
    );
    expect(beforeHeaders.setHeader).toHaveBeenCalledWith("Content-Length", "0");
    expect(beforeHeaders.end).toHaveBeenCalledWith(
      JSON.stringify({ error: "Stream transmission failed." }),
    );
    expect(afterHeaders.state.destroyedWith).toMatchObject({
      message: "after send",
    });
  });

  it("falls back to default utf-8 encoding when encoding parameter is undefined with a callback", () => {
    const { response, write } = createResponse();
    const cb = vi.fn();

    const result = resWrite(response, "data-chunk", undefined, cb);

    expect(result).toBe(true);
    expect(write).toHaveBeenCalledWith("data-chunk", "utf-8", cb);
  });

  it("destroys response when error occurs after headersSent is true and response has not ended", async () => {
    const { response, state } = createResponse();
    state.headersSent = true;
    state.writableEnded = false;
    const destroySpy = vi.spyOn(response, "destroy");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const testError = streamError("pipeline fail after headers");
    const readable = new Readable({
      read() {
        this.destroy(testError);
      },
    });

    await resStream(response, readable);

    expect(destroySpy).toHaveBeenCalledWith(testError);
  });

  it("destroys response with error when error occurs after headersSent and response has not ended", async () => {
    const { response, state } = createResponse();
    state.headersSent = true;
    state.writableEnded = false;
    const destroySpy = vi.spyOn(response, "destroy");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const streamErr = streamError("pipeline fail after headers sent");
    const readable = new Readable({
      read() {
        this.destroy(streamErr);
      },
    });

    await resStream(response, readable);

    expect(destroySpy).toHaveBeenCalledWith(streamErr);
  });
  describe("resWrite branch coverage", () => {
    it("returns false and invokes callback when writableFinished is true but writableEnded is false", () => {
      const { response, state } = createResponse();
      state.writableEnded = false;
      state.writableFinished = true;
      const callback = vi.fn();

      const result = resWrite(response, "data", undefined, callback);

      expect(result).toBe(false);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it("passes custom encoding correctly when callback is omitted", () => {
      const { response, write } = createResponse();

      const result = resWrite(response, "ascii-chunk", "ascii");

      expect(result).toBe(true);
      expect(write).toHaveBeenCalledWith("ascii-chunk", "ascii", undefined);
    });
  });
});
