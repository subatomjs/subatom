// tests/Request.test.ts
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../../../package/core/http/errors/Error.js";
import { Request } from "../../../package/core/http/request/Request.js";
import { createMockIncomingMessage } from "./helpers/mockIncomingMessage.js";

describe("Request (Core Subatom Request Class)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SUBATOM_TRUST_PROXY;
    delete process.env.SUBATOM_DEFAULT_HOST;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Constructor & Property Extraction", () => {
    it("should correctly initialize HTTP method, URL, headers, and paths", () => {
      const raw = createMockIncomingMessage({
        method: "post",
        url: "/v1/users/search?role=engineer&sort=asc",
        headers: {
          host: "api.subatom.dev",
          cookie: "session=xyz123; user_pref=compact",
          "content-type": "application/json",
        },
        remoteAddress: "10.0.0.5",
      });

      const req = new Request(raw);

      expect(req.raw).toBe(raw);
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/v1/users/search?role=engineer&sort=asc");
      expect(req.path).toBe("/v1/users/search");
      expect(req.query).toEqual({ role: "engineer", sort: "asc" });
      expect(req.host).toBe("api.subatom.dev");
      expect(req.hostname).toBe("api.subatom.dev");
      expect(req.protocol).toBe("http");
      expect(req.secure).toBe(false);
      expect(req.ip).toBe("10.0.0.5");
      expect(req.cookies).toEqual({ session: "xyz123", user_pref: "compact" });
      expect(req.params).toEqual({});
      expect(req.locals).toEqual({});
    });

    it("should parse host with port into host and hostname properties correctly", () => {
      const raw = createMockIncomingMessage({
        headers: { host: "subatom.dev:3000" },
      });
      const req = new Request(raw);
      expect(req.host).toBe("subatom.dev:3000");
      expect(req.hostname).toBe("subatom.dev");
    });

    it("should respect SUBATOM_TRUST_PROXY env variable fallback", () => {
      process.env.SUBATOM_TRUST_PROXY = "true";

      const raw = createMockIncomingMessage({
        headers: {
          host: "internal-cluster",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "public.subatom.dev",
          "x-forwarded-for": "198.51.100.4",
        },
      });

      const req = new Request(raw);
      expect(req.protocol).toBe("https");
      expect(req.secure).toBe(true);
      expect(req.host).toBe("public.subatom.dev");
      expect(req.ip).toBe("198.51.100.4");
    });

    it("should throw BadRequestError on malformed URLs", () => {
      const raw = createMockIncomingMessage({
        url: "http://[invalid-ipv6-bracket",
      });

      expect(() => new Request(raw)).toThrowError(BadRequestError);
    });

    it("should attach error listener to raw request socket to log socket issues", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const raw = createMockIncomingMessage();
      new Request(raw);

      raw.emit("error", new Error("EPIPE Socket broke"));
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Subatom Stream Error]: Request socket issue:",
        "EPIPE Socket broke",
      );
      consoleSpy.mockRestore();
    });
  });

  describe("Public API Methods", () => {
    it("get() should look up headers case-insensitively", () => {
      const raw = createMockIncomingMessage({
        headers: { "x-api-key": "secret-token" },
      });
      const req = new Request(raw);

      expect(req.get("X-Api-Key")).toBe("secret-token");
      expect(req.get("x-api-key")).toBe("secret-token");
      expect(req.get("non-existent")).toBeUndefined();
    });

    describe("accepts() content negotiation", () => {
      it("should return boolean when single type string is checked", () => {
        const raw = createMockIncomingMessage({
          headers: { accept: "application/json, text/html" },
        });
        const req = new Request(raw);

        expect(req.accepts("application/json")).toBe(true);
        expect(req.accepts("image/png")).toBe(false);
      });

      it("should return the first matched format when multiple types are passed", () => {
        const raw = createMockIncomingMessage({
          headers: {
            accept: "text/html, application/xhtml+xml, application/xml;q=0.9",
          },
        });
        const req = new Request(raw);

        expect(req.accepts("application/json", "text/html")).toBe("text/html");
        expect(req.accepts("image/png", "application/pdf")).toBe(false);
      });
    });

    describe("Body parsers (buffer, text, json, formData)", () => {
      it("should read stream as Buffer via buffer()", async () => {
        const raw = createMockIncomingMessage({
          bodyChunks: ["buffer payload"],
        });
        const req = new Request(raw);

        const buf = await req.buffer();
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.toString("utf-8")).toBe("buffer payload");
      });

      it("should read stream as string via text()", async () => {
        const raw = createMockIncomingMessage({
          bodyChunks: ["plain string body"],
        });
        const req = new Request(raw);

        const txt = await req.text();
        expect(txt).toBe("plain string body");
      });

      it("should parse JSON body via json()", async () => {
        const raw = createMockIncomingMessage({
          bodyChunks: [JSON.stringify({ status: "ok", code: 200 })],
        });
        const req = new Request(raw);

        const data = await req.json<{ status: string; code: number }>();
        expect(data).toEqual({ status: "ok", code: 200 });
      });

      it("should parse Form Data via formData()", async () => {
        const raw = createMockIncomingMessage({
          bodyChunks: ["field1=val1&field2=val2"],
        });
        const req = new Request(raw);

        const form = await req.formData();
        expect(form.get("field1")).toBe("val1");
        expect(form.get("field2")).toBe("val2");
      });
    });

    describe("Stream lifecycle operations (onData, onEnd, pipe, stream)", () => {
      it("should handle onData lifecycle", async () => {
        const raw = createMockIncomingMessage({
          bodyChunks: ["chunk1", "chunk2"],
        });
        const req = new Request(raw);

        const chunks: Buffer[] = [];
        const unsub = req.onData((c) => chunks.push(c));

        await new Promise<void>((resolve) => {
          raw.on("end", resolve);
          raw.resume();
        });

        expect(chunks.length).toBe(2);
        expect(Buffer.concat(chunks).toString()).toBe("chunk1chunk2");
        unsub();
      });

      it("should handle onEnd lifecycle", async () => {
        const raw = createMockIncomingMessage({ bodyChunks: ["chunk"] });
        const req = new Request(raw);

        const endSpy = vi.fn();
        req.onEnd(endSpy);

        await new Promise<void>((resolve) => {
          raw.on("end", resolve);
          raw.resume();
        });

        expect(endSpy).toHaveBeenCalledTimes(1);
      });

      it("should pipe stream to destination writable", async () => {
        const raw = createMockIncomingMessage({
          bodyChunks: ["stream-content"],
        });
        const req = new Request(raw);
        const destination = new PassThrough();

        req.pipe(destination);

        const collected: Buffer[] = [];
        destination.on("data", (chunk) => collected.push(Buffer.from(chunk)));

        await new Promise<void>((resolve) => destination.on("end", resolve));
        expect(Buffer.concat(collected).toString()).toBe("stream-content");
      });

      it("should expose native stream via stream()", () => {
        const raw = createMockIncomingMessage();
        const req = new Request(raw);
        expect(req.stream()).toBe(raw);
      });
    });
  });
});
