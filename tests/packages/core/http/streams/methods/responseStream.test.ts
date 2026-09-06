import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resEnd } from "../../../../../../packages/core/http/streams/methods/response/resEnd.js";
import { resSendStream } from "../../../../../../packages/core/http/streams/methods/response/resSendStream.js";
import { resStream } from "../../../../../../packages/core/http/streams/methods/response/resStream.js";

interface ResponseState {
  headersSent: boolean;
  writableEnded: boolean;
  finished: boolean;
  statusCode: number;
  headers: Map<string, string>;
  destroyedWith: Error | undefined;
}

interface ResponseFixture {
  response: ServerResponse;
  state: ResponseState;
  end: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
}

function createResponse(): ResponseFixture {
  const state: ResponseState = {
    headersSent: false,
    writableEnded: false,
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
  const setHeader = vi.fn((name: string, value: string) => {
    state.headers.set(name.toLowerCase(), value);
  });
  Object.defineProperties(writable, {
    headersSent: { configurable: true, get: () => state.headersSent },
    writableEnded: { configurable: true, get: () => state.writableEnded },
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
    setHeader,
    destroy(error?: Error) {
      state.destroyedWith = error;
      return destroyWritable(error);
    },
  }) as unknown as ServerResponse;

  return { response, state, end, setHeader };
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
    // Arrange
    const { response } = createResponse();
    const readable = new Readable({ read() {} });
    const destroySpy = vi.spyOn(readable, "destroy");
    Object.defineProperty(response, "writableEnded", { value: true });

    // Act
    await resStream(response, readable);

    // Assert
    expect(destroySpy).toHaveBeenCalledOnce();
  });

  it("reports stream errors through the supplied error callback", async () => {
    // Arrange
    const { response } = createResponse();
    const readable = new Readable({
      read() {
        this.destroy(streamError("read failure"));
      },
    });
    const onError = vi.fn<(error: Error) => void>();

    // Act
    await resStream(response, readable, { onError });

    // Assert
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "read failure" }));
  });

  it("ignores a client close that destroys the active readable stream", async () => {
    // Arrange
    const { response } = createResponse();
    const request = new EventEmitter();
    const readable = new Readable({ read() {} });
    const closeHandler = () => readable.destroy(streamError("client closed", "ERR_STREAM_PREMATURE_CLOSE"));
    request.once("close", closeHandler);
    const completion = resStream(response, readable);

    // Act
    request.emit("close");
    await completion;

    // Assert
    expect(readable.destroyed).toBe(true);
    expect(response.destroyed).toBe(true);
    expect(request.listenerCount("close")).toBe(0);
  });

  it("writes a 500 response before headers and destroys an active response after headers", async () => {
    // Arrange
    const beforeHeaders = createResponse();
    const afterHeaders = createResponse();
    afterHeaders.state.headersSent = true;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Act
    await resStream(beforeHeaders.response, Readable.from(["chunk", Promise.reject(streamError("before headers"))]));
    await resStream(afterHeaders.response, new Readable({ read() { this.destroy(streamError("after headers")); } }));

    // Assert
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(beforeHeaders.state.statusCode).toBe(500);
    expect(beforeHeaders.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    expect(beforeHeaders.end).toHaveBeenCalledWith(JSON.stringify({ error: "Internal Server Error" }));
    expect(afterHeaders.state.destroyedWith).toMatchObject({ message: "after headers" });
  });

  it("returns early for ended responses and normalizes both resEnd callback overloads", () => {
    // Arrange
    const ended = createResponse();
    ended.state.finished = true;
    const callbackOnly = vi.fn();
    const callbackWithChunk = vi.fn();
    const callbackWithEncoding = vi.fn();

    // Act
    resEnd(ended.response, "ignored");
    Reflect.apply(resEnd, undefined, [ended.response, callbackOnly]);
    Reflect.apply(resEnd, undefined, [ended.response, "payload", callbackWithChunk]);
    resEnd(ended.response, "encoded", "utf8", callbackWithEncoding);

    // Assert
    expect(ended.end).not.toHaveBeenCalled();
    const active = createResponse();
    Reflect.apply(resEnd, undefined, [active.response, callbackOnly]);
    Reflect.apply(resEnd, undefined, [active.response, "payload", callbackWithChunk]);
    resEnd(active.response, "encoded", "utf8", callbackWithEncoding);
    expect(active.end).toHaveBeenNthCalledWith(1, undefined, "utf-8", callbackOnly);
    expect(active.end).toHaveBeenNthCalledWith(2, "payload", "utf-8", callbackWithChunk);
    expect(active.end).toHaveBeenNthCalledWith(3, "encoded", "utf8", callbackWithEncoding);
  });

  it("rejects sent headers and handles send-stream errors before and after headers", () => {
    // Arrange
    const sent = createResponse();
    sent.state.headersSent = true;
    const beforeHeaders = createResponse();
    const afterHeaders = createResponse();
    const beforeStream = new Readable({ read() {} });
    const afterStream = new Readable({ read() {} });
    afterHeaders.response.once("error", () => undefined);

    // Act
    expect(() => resSendStream(sent.response, Readable.from([]))).toThrow("Headers already sent");
    resSendStream(beforeHeaders.response, beforeStream, { contentType: "text/plain", contentLength: 0, statusCode: 0 });
    beforeStream.emit("error", streamError("before send"));
    resSendStream(afterHeaders.response, afterStream);
    afterHeaders.state.headersSent = true;
    afterStream.emit("error", streamError("after send"));

    // Assert
    expect(beforeHeaders.state.statusCode).toBe(500);
    expect(beforeHeaders.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain");
    expect(beforeHeaders.setHeader).toHaveBeenCalledWith("Content-Length", "0");
    expect(beforeHeaders.end).toHaveBeenCalledWith(JSON.stringify({ error: "Stream transmission failed." }));
    expect(afterHeaders.state.destroyedWith).toMatchObject({ message: "after send" });
  });
});