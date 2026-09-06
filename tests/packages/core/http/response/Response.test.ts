import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Response } from "../../../../../packages/core/http/response/Response.js";
import * as streamMethods from "../../../../../packages/core/http/streams/methods/index.js";

vi.mock("../../../../../packages/core/http/streams/methods/index.js", () => ({
  resDownload: vi.fn(),
  resSendFile: vi.fn(),
  resEnd: vi.fn(),
  resSendStream: vi.fn(),
  resStream: vi.fn(),
  resWrite: vi.fn(),
}));

interface MutableResponseState {
  headersSent: boolean;
  writableEnded: boolean;
}

function createMockServerResponse(): {
  raw: ServerResponse;
  state: MutableResponseState;
} {
  const state: MutableResponseState = {
    headersSent: false,
    writableEnded: false,
  };

  const emitter = new EventEmitter();
  const raw = Object.assign(emitter, {
    statusCode: 200,
    setHeader: vi.fn(),
    removeHeader: vi.fn(),
    end: vi.fn(() => {
      state.writableEnded = true;
    }),
  }) as unknown as ServerResponse;

  Object.defineProperty(raw, "headersSent", {
    get: () => state.headersSent,
    configurable: true,
  });

  Object.defineProperty(raw, "writableEnded", {
    get: () => state.writableEnded,
    configurable: true,
  });

  return { raw, state };
}

describe("Response", () => {
  let response: Response;
  let raw: ServerResponse;
  let rawState: MutableResponseState;

  beforeEach(() => {
    vi.clearAllMocks();
    const fixture = createMockServerResponse();
    raw = fixture.raw;
    rawState = fixture.state;
    response = new Response(raw);
  });

  describe("State inspection & Status getters", () => {
    it("should inspect headersSent, writableEnded, finished, and statusCode", () => {
      expect(response.headersSent).toBe(false);
      expect(response.writableEnded).toBe(false);
      expect(response.finished).toBe(false);
      expect(response.statusCode).toBe(200);
      expect(response.rawResponse).toBe(raw);
    });

    it("should set status code fluently", () => {
      expect(response.status(201)).toBe(response);
      expect(response.statusCode).toBe(201);
      expect(raw.statusCode).toBe(201);
    });
  });

  describe("Header operations", () => {
    it("should support set, header, setHeader, append, get, type, and removeHeader", () => {
      response.set("x-app", "subatom");
      expect(response.get("X-APP")).toBe("subatom");

      response.header("x-version", "2.0");
      expect(response.get("x-version")).toBe("2.0");

      response.setHeader("x-numeric", "100");
      expect(response.get("x-numeric")).toBe("100");

      response.append("x-tag", "v1");
      response.append("x-tag", "v2");
      expect(response.get("x-tag")).toEqual(["v1", "v2"]);

      response.type("text/markdown");
      expect(response.get("content-type")).toBe("text/markdown");

      response.contentType("application/xml");
      expect(response.get("content-type")).toBe("application/xml");

      response.removeHeader("x-app");
      expect(response.get("x-app")).toBeUndefined();
    });

    it("should append Vary headers and validate location", () => {
      response.vary("Accept");
      expect(response.get("vary")).toBe("Accept");

      response.location("/home");
      expect(response.get("location")).toBe("/home");
    });
  });

  describe("Cookies and Redirect", () => {
    it("should delegate cookie and clearCookie", () => {
      response.cookie("sessionId", "abc", { secure: true });
      expect(response.get("set-cookie")).toContain("sessionId=abc");

      response.clearCookie("sessionId");
      const cookies = response.get("set-cookie");
      expect(Array.isArray(cookies)).toBe(true);
      expect(cookies?.[1]).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    });

    it("should execute redirect with 302 by default", () => {
      response.redirect("/welcome");
      expect(response.statusCode).toBe(302);
      expect(response.get("location")).toBe("/welcome");
      expect(raw.writableEnded).toBe(true);
    });
  });

  describe("Body, JSON, and HTML Rendering", () => {
    it("should transmit plain send bodies", () => {
      response.send("Hello World");
      expect(response.get("content-type")).toBe("text/html; charset=utf-8");
      expect(raw.end).toHaveBeenCalledWith("Hello World");
    });

    it("should serialize json bodies fluently", () => {
      expect(response.json({ framework: "subatom" })).toBe(response);
      expect(response.get("content-type")).toBe("application/json; charset=utf-8");
      expect(raw.end).toHaveBeenCalledWith(JSON.stringify({ framework: "subatom" }));
    });

    it("should transmit html with default utf-8 text/html content-type", () => {
      response.html("<p>Subatom</p>");
      expect(response.get("content-type")).toBe("text/html; charset=utf-8");
      expect(raw.end).toHaveBeenCalledWith("<p>Subatom</p>");
    });
  });

  describe("Streaming and File Methods", () => {
    it("should delegate write and end to stream methods", () => {
      const cb = vi.fn();
      response.write("chunk", "utf-8", cb);
      expect(streamMethods.resWrite).toHaveBeenCalledWith(raw, "chunk", "utf-8", cb);

      response.end("final");
      expect(streamMethods.resEnd).toHaveBeenCalledWith(raw, "final", undefined, undefined);
    });

    it("should delegate stream and sendStream", async () => {
      const mockReadable = {} as Readable;
      await response.stream(mockReadable);
      expect(streamMethods.resStream).toHaveBeenCalledWith(raw, mockReadable, undefined);

      response.sendStream(mockReadable);
      expect(streamMethods.resSendStream).toHaveBeenCalledWith(raw, mockReadable, undefined);
    });

    it("should delegate sendFile, download, and attachment", () => {
      response.sendFile("/var/data.txt");
      expect(streamMethods.resSendFile).toHaveBeenCalledWith(raw, "/var/data.txt", {});

      response.download("/var/data.txt", "downloaded.txt");
      expect(streamMethods.resDownload).toHaveBeenCalledWith(
        raw,
        "/var/data.txt",
        "downloaded.txt",
        {},
      );

      response.attachment("file.csv");
      expect(response.get("content-disposition")).toContain("attachment;");
    });

    it("should delegate format negotiation", () => {
      const formatHandlers = {
        "text/plain": vi.fn(),
      };
      response.format(formatHandlers, { accept: "text/plain" });
      expect(formatHandlers["text/plain"]).toHaveBeenCalled();
    });
  });
});