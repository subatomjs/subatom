import type { ServerResponse } from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendBody } from "../../../../../../packages/core/http/response/services/sendBody.service.js";
import { sendJson } from "../../../../../../packages/core/http/response/services/sendJson.service.js";
import { setAttachment } from "../../../../../../packages/core/http/response/services/setAttachment.service.js";
import { redirect } from "../../../../../../packages/core/http/response/services/redirect.service.js";
import { formatResponse } from "../../../../../../packages/core/http/response/services/format.service.js";
import { SubatomError } from "../../../../../../packages/errors/Errors.js";

interface MutableResponseState {
  writableEnded: boolean;
}

function createMockServerResponse(headersMap: Map<string, string | string[]>): {
  raw: ServerResponse;
  state: MutableResponseState;
} {
  const state: MutableResponseState = { writableEnded: false };
  const raw = {
    statusCode: 200,
    setHeader: vi.fn((k: string, v: string | string[]) => {
      headersMap.set(k.toLowerCase(), v);
    }),
    end: vi.fn(() => {
      state.writableEnded = true;
    }),
  } as unknown as ServerResponse;

  Object.defineProperty(raw, "writableEnded", {
    get: () => state.writableEnded,
    configurable: true,
  });

  return { raw, state };
}

describe("Response Transmission Services", () => {
  let raw: ServerResponse;
  let rawState: MutableResponseState;
  let headersMap: Map<string, string | string[]>;

  beforeEach(() => {
    headersMap = new Map();
    const fixture = createMockServerResponse(headersMap);
    raw = fixture.raw;
    rawState = fixture.state;
  });

  describe("sendBody", () => {
    it("should not send when the raw response has already ended", () => {
      rawState.writableEnded = true;

      sendBody(raw, headersMap, false, "ignored");

      expect(raw.end).not.toHaveBeenCalled();
    });
    it("should end response immediately when body is null or undefined", () => {
      sendBody(raw, headersMap, false, undefined);
      expect(raw.end).toHaveBeenCalledWith();

      rawState.writableEnded = false;
      sendBody(raw, headersMap, false, null as unknown as string);
      expect(raw.end).toHaveBeenCalledWith();
    });

    it("should forward plain objects to onJsonDelegate callback", () => {
      const delegate = vi.fn();
      const payload = { ok: true };
      sendBody(raw, headersMap, false, payload, delegate);
      expect(delegate).toHaveBeenCalledWith(payload);
      expect(raw.end).not.toHaveBeenCalled();
    });

    it("should ignore an object when no JSON delegate is provided", () => {
      sendBody(raw, headersMap, false, { ignored: true });

      expect(raw.end).not.toHaveBeenCalled();
    });

    it("should set default HTML content-type and Content-Length for string bodies", () => {
      sendBody(raw, headersMap, false, "<h1>Hello</h1>");
      expect(headersMap.get("content-type")).toBe("text/html; charset=utf-8");
      expect(headersMap.get("content-length")).toBe("14");
      expect(raw.end).toHaveBeenCalledWith("<h1>Hello</h1>");
    });

    it("should set byte length for Buffer and Uint8Array instances without altering content-type", () => {
      const buf = Buffer.from("Buffer Content");
      sendBody(raw, headersMap, false, buf);
      expect(headersMap.get("content-length")).toBe(buf.length.toString());
      expect(headersMap.get("content-type")).toBeUndefined();
      expect(raw.end).toHaveBeenCalledWith(buf);

      const bytes = new Uint8Array([1, 2, 3]);
      rawState.writableEnded = false;
      sendBody(raw, headersMap, false, bytes);
      expect(headersMap.get("content-length")).toBe("3");
      expect(raw.end).toHaveBeenCalledWith(bytes);
    });
  });

  describe("sendJson", () => {
    it("should not serialize when the raw response has already ended", () => {
      rawState.writableEnded = true;

      sendJson(raw, headersMap, false, { ignored: true });

      expect(raw.end).not.toHaveBeenCalled();
    });
    it("should serialize objects to JSON and set application/json content-type", () => {
      sendJson(raw, headersMap, false, { status: "ready" });
      expect(headersMap.get("content-type")).toBe("application/json; charset=utf-8");
      expect(raw.end).toHaveBeenCalledWith(JSON.stringify({ status: "ready" }));
    });

    it("should preserve an existing content type during JSON serialization", () => {
      headersMap.set("content-type", "application/custom");

      sendJson(raw, headersMap, false, { ready: true });

      expect(headersMap.get("content-type")).toBe("application/custom");
  });

    it("should throw SubatomError when serialization fails on circular references", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(() => sendJson(raw, headersMap, false, circular)).toThrow(SubatomError);
    });
  });

  describe("setAttachment", () => {
    it("should set default attachment header when filename is omitted", () => {
      setAttachment(raw, headersMap, false);
      expect(headersMap.get("content-disposition")).toBe("attachment");
    });

    it("should encode Unicode filenames per RFC 5987 with ASCII fallbacks", () => {
      setAttachment(raw, headersMap, false, 'report "2026" ✓.pdf');
      const disposition = headersMap.get("content-disposition") as string;
      expect(disposition).toContain('filename="report \'2026\' _.pdf"');
      expect(disposition).toContain("filename*=UTF-8''report%20%222026%22%20%E2%9C%93.pdf");
    });

    it("should encode RFC 5987 characters in attachment filenames", () => {
      setAttachment(raw, headersMap, false, "file*(test).txt");

      expect(headersMap.get("content-disposition")).toContain(
        "filename*=UTF-8''file%2A%28test%29.txt",
      );
    });
  });

  describe("redirect", () => {
    it("should trigger redirect callback on valid 3xx status codes", () => {
      const callback = vi.fn();
      redirect("/dashboard", 301, callback);
      expect(callback).toHaveBeenCalledWith(301, "/dashboard");
    });

    it("should throw SubatomError if status code is not within 300..399", () => {
      expect(() => redirect("/login", 200, vi.fn())).toThrow(SubatomError);
      expect(() => redirect("/login", 400, vi.fn())).toThrow(SubatomError);
    });

    it("should throw SubatomError if redirect URL contains CRLF characters", () => {
      expect(() => redirect("/path\r\nLocation: evil", 302, vi.fn())).toThrow(SubatomError);
    });
  });

  describe("formatResponse", () => {
    it("should execute matching format handler based on accept header", () => {
      const jsonHandler = vi.fn();
      const htmlHandler = vi.fn();
      const setType = vi.fn();

      formatResponse(
        raw,
        { accept: "application/json" },
        false,
        { "application/json": jsonHandler, "text/html": htmlHandler },
        setType,
      );

      expect(setType).toHaveBeenCalledWith("application/json");
      expect(jsonHandler).toHaveBeenCalled();
      expect(htmlHandler).not.toHaveBeenCalled();
    });

    it("should fall back to default handler if no formats match", () => {
      const defaultHandler = vi.fn();
      const setType = vi.fn();

      formatResponse(
        raw,
        { accept: "image/png" },
        false,
        { "application/json": vi.fn(), default: defaultHandler },
        setType,
      );

      expect(defaultHandler).toHaveBeenCalled();
    });

    it("should return 406 Not Acceptable JSON if neither matched nor default exist", () => {
      formatResponse(
        raw,
        { accept: "image/png" },
        false,
        { "application/json": vi.fn() },
        vi.fn(),
      );

      expect(raw.statusCode).toBe(406);
      expect(raw.end).toHaveBeenCalledWith(
        expect.stringContaining("Not Acceptable"),
      );
    });

    it("should warn and no-op if headers are already sent", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      formatResponse(raw, {}, true, {}, vi.fn());
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});