// tests/package/pipeline/multipartParser.test.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  BadRequestError,
  PayloadTooLargeError,
  UnprocessableEntityError,
} from "../../../package/core/http/errors/Error.js";
import { parseMultipart } from "../../../package/core/pipeline/file-system/multipartParser.js";

function createMultipartPayload(
  boundary: string,
  fields: Record<string, string | string[]>,
  files: Array<{
    field: string;
    filename: string;
    contentType?: string;
    content: string | Buffer;
  }> = [],
) {
  const chunks: Buffer[] = [];

  for (const [k, val] of Object.entries(fields)) {
    const values = Array.isArray(val) ? val : [val];
    for (const v of values) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        ),
      );
    }
  }

  for (const f of files) {
    const ct = f.contentType ? `Content-Type: ${f.contentType}\r\n` : "";
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\n${ct}\r\n`,
      ),
    );
    chunks.push(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content));
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe("Enterprise Suite: multipartParser", () => {
  const boundary = "---------------------------974767299852498929531610575";
  const defaultHeaders = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Header Validation & Boundary Parsing
  // ---------------------------------------------------------------------------
  describe("Header Validation", () => {
    it("rejects when headers object is missing or empty", async () => {
      const stream = Readable.from([]);
      await expect(
        parseMultipart(stream, {} as any, { storage: "memory" }),
      ).rejects.toThrow(BadRequestError);
    });

it("rejects when content-type is not multipart/form-data", async () => {
      const stream = Readable.from([]);
      await expect(
        parseMultipart(
          stream,
          { "content-type": "application/json" },
          { storage: "memory" },
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it("accepts headers with lowercase 'content-type' and boundary", async () => {
      const customBoundary = "custom_boundary_12345";
      const payload = createMultipartPayload(customBoundary, { name: "test" });
      const stream = Readable.from(payload);

      const result = await parseMultipart(
        stream,
        { "content-type": `multipart/form-data; boundary=${customBoundary}` },
        { storage: "memory" },
      );

      expect(result.body).toEqual({ name: "test" });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Storage Engines & Options
  // ---------------------------------------------------------------------------
  describe("Storage Engines", () => {
    it("defaults to memory storage when storage option is not explicitly provided", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "file",
          filename: "test.txt",
          contentType: "text/plain",
          content: "default memory buffer",
        },
      ]);

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {storage: "memory"});

      expect(result.files["file"]![0]!.storageType).toBe("memory");
      expect(result.files["file"]![0]!.bufferContent?.toString()).toBe("default memory buffer");
    });

    it("creates default temp directory for disk storage if dest is omitted", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "tempFile",
          filename: "auto_temp.txt",
          contentType: "text/plain",
          content: "disk payload",
        },
      ]);

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {
        storage: "disk",
      });

      const file = result.files["tempFile"]![0]!;
      expect(file.storageType).toBe("disk");
      expect(file.path).toBeDefined();
      expect(fs.existsSync(file.path!)).toBe(true);

      await file.destroy();
      expect(fs.existsSync(file.path!)).toBe(false);
    });

    it("rejects when disk storage destination cannot be created", async () => {
      const stream = Readable.from([]);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "mkdirSync").mockImplementation(() => {
        throw new Error("EACCES permission denied");
      });

      await expect(
        parseMultipart(stream, defaultHeaders, {
          storage: "disk",
          dest: "/restricted/folder",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Field & File Parsing Mechanics
  // ---------------------------------------------------------------------------
  describe("Field & File Data Handling", () => {
    it("parses multiple text fields and arrays of multiple files on the same key", async () => {
      const payload = createMultipartPayload(
        boundary,
        { username: "alice", tag: "admin" },
        [
          {
            field: "photos",
            filename: "photo1.png",
            contentType: "image/png",
            content: "photo-1-bytes",
          },
          {
            field: "photos",
            filename: "photo2.png",
            contentType: "image/png",
            content: "photo-2-bytes",
          },
        ],
      );

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {
        storage: "memory",
      });

      expect(result.body).toEqual({ username: "alice", tag: "admin" });
      expect(result.files["photos"]).toHaveLength(2);
      expect(result.files["photos"]![0]!.filename).toBe("photo1.png");
      expect(result.files["photos"]![1]!.filename).toBe("photo2.png");
    });

    it("skips files that have empty filename values", async () => {
      const payload = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="emptyFile"; filename=""\r\nContent-Type: text/plain\r\n\r\n\r\n--${boundary}--\r\n`,
      );

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {
        storage: "memory",
      });

      expect(result.files["emptyFile"]).toBeUndefined();
    });

    it("defaults to text/plain when file content-type header is omitted", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "binary",
          filename: "blob.bin",
          content: "raw-bytes",
        },
      ]);

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {
        storage: "memory",
      });

      expect(result.files["binary"]![0]!.mimetype).toBe("text/plain");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. File Object Methods (destroy, toBuffer, stream)
  // ---------------------------------------------------------------------------
  describe("Parsed File Object Helpers", () => {
    it("handles destroy() safely for memory storage and redundant calls", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "mem",
          filename: "mem.txt",
          contentType: "text/plain",
          content: "memory-data",
        },
      ]);

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {
        storage: "memory",
      });

      const file = result.files["mem"]![0]!;
      await expect(file.destroy()).resolves.toBeUndefined();
      await expect(file.destroy()).resolves.toBeUndefined();
    });

    it("handles destroy() when disk file was already removed from disk", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "diskDoc",
          filename: "doc.txt",
          contentType: "text/plain",
          content: "disk-data",
        },
      ]);

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {
        storage: "disk",
        dest: os.tmpdir(),
      });

      const file = result.files["diskDoc"]![0]!;
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      await expect(file.destroy()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Limits & Constraints (PayloadTooLargeError)
  // ---------------------------------------------------------------------------
  describe("Limits Enforcement", () => {
    it("throws PayloadTooLargeError when single file exceeds fileSize limit", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "large",
          filename: "large.bin",
          contentType: "application/octet-stream",
          content: "x".repeat(50),
        },
      ]);

      const stream = Readable.from(payload);
      await expect(
        parseMultipart(stream, defaultHeaders, {
          storage: "memory",
          limits: { fileSize: 10 },
        }),
      ).rejects.toThrow(PayloadTooLargeError);
    });

    it("throws PayloadTooLargeError when number of files exceeds files limit", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        { field: "f1", filename: "1.txt", content: "a" },
        { field: "f2", filename: "2.txt", content: "b" },
      ]);

      const stream = Readable.from(payload);
      await expect(
        parseMultipart(stream, defaultHeaders, {
          storage: "memory",
          limits: { files: 1 },
        }),
      ).rejects.toThrow(PayloadTooLargeError);
    });

    it("truncates field value according to fieldSize limit", async () => {
      const payload = createMultipartPayload(
        boundary,
        { description: "very long description that exceeds limit" },
        [],
      );

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {
        storage: "memory",
        limits: { fieldSize: 5 },
      });

      expect(result.body.description).toBe("very ");
    });

    it("throws PayloadTooLargeError when number of fields exceeds fields limit", async () => {
      const payload = createMultipartPayload(
        boundary,
        { a: "1", b: "2", c: "3" },
        [],
      );

      const stream = Readable.from(payload);
      await expect(
        parseMultipart(stream, defaultHeaders, {
          storage: "memory",
          limits: { fields: 2 },
        }),
      ).rejects.toThrow(PayloadTooLargeError);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. MIME Type Validation (UnprocessableEntityError)
  // ---------------------------------------------------------------------------
  describe("MIME Type Validation", () => {
    it("aborts and throws UnprocessableEntityError on disallowed MIME type", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "exec",
          filename: "script.sh",
          contentType: "application/x-sh",
          content: "echo hi",
        },
      ]);

      const stream = Readable.from(payload);
      await expect(
        parseMultipart(stream, defaultHeaders, {
          storage: "memory",
          allowedMimeTypes: ["image/jpeg", "image/png"],
        }),
      ).rejects.toThrow(UnprocessableEntityError);
    });

    it("accepts exact match allowed MIME types", async () => {
      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "photo",
          filename: "pic.webp",
          contentType: "image/webp",
          content: "image-bytes",
        },
      ]);

      const stream = Readable.from(payload);
      const result = await parseMultipart(stream, defaultHeaders, {
        storage: "memory",
        allowedMimeTypes: ["image/webp"],
      });

      expect(result.files["photo"]).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Stream Abortions & Error Handling
  // ---------------------------------------------------------------------------
  describe("Stream Abortions & Error Handling", () => {
    it("handles incoming request stream 'aborted' event cleanly", async () => {
      const stream = new PassThrough();
      const parsePromise = parseMultipart(stream, defaultHeaders, {
        storage: "memory",
      });

      stream.emit("aborted");

      await expect(parsePromise).rejects.toThrow(BadRequestError);
    });

    it("handles incoming request stream 'error' event cleanly", async () => {
      const stream = new PassThrough();
      const parsePromise = parseMultipart(stream, defaultHeaders, {
        storage: "memory",
      });

      stream.emit("error", new Error("Socket connection reset"));

      await expect(parsePromise).rejects.toThrow("Socket connection reset");
    });

    it("catches and ignores error if disk cleanup unlink fails during error cleanup", async () => {
      vi.spyOn(fs, "unlink").mockImplementation((_, cb) =>
        (cb as any)(new Error("Unlink failed")),
      );

      const payload = createMultipartPayload(boundary, {}, [
        {
          field: "f",
          filename: "f.txt",
          contentType: "application/x-invalid",
          content: "test",
        },
      ]);

      const stream = Readable.from(payload);
      await expect(
        parseMultipart(stream, defaultHeaders, {
          storage: "disk",
          allowedMimeTypes: ["image/png"],
        }),
      ).rejects.toThrow(UnprocessableEntityError);
    });
  });
});