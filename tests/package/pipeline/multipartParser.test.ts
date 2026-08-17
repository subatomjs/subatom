import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseMultipart } from "../../../package/core/pipeline/file-system/multipartParser.js";
import {
  BadRequestError,
  PayloadTooLargeError,
  UnprocessableEntityError,
} from "../../../package/core/http/errors/Error.js";

function createMultipartPayload(boundary: string, fields: Record<string, string>, files: Array<{ field: string; filename: string; contentType: string; content: string }>) {
  const chunks: Buffer[] = [];

  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }

  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n${f.content}\r\n`,
      ),
    );
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe("parseMultipart", () => {
  const boundary = "---------------------------974767299852498929531610575";
  const defaultHeaders = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };

  it("rejects when invalid multipart headers are passed", async () => {
    const stream = new PassThrough();
    await expect(
      parseMultipart(stream, { "content-type": "application/json" }, { storage: "memory" }),
    ).rejects.toThrow(BadRequestError);
  });

  it("rejects when disk storage destination cannot be created", async () => {
    const stream = new PassThrough();
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {
      throw new Error("EACCES permission denied");
    });

    await expect(
      parseMultipart(stream, defaultHeaders, { storage: "disk", dest: "/invalid/root" }),
    ).rejects.toThrow(BadRequestError);

    vi.restoreAllMocks();
  });

  it("parses text fields and in-memory files successfully", async () => {
    const payload = createMultipartPayload(
      boundary,
      { username: "john_doe", role: "admin" },
      [{ field: "avatar", filename: "pic.png", contentType: "image/png", content: "binary-png-data" }],
    );

    const stream = Readable.from(payload);
    const result = await parseMultipart(stream, defaultHeaders, {
      storage: "memory",
      allowedMimeTypes: ["image/png"],
    });

    expect(result.body).toEqual({ username: "john_doe", role: "admin" });
    expect(result.files["avatar"]).toBeDefined();
    expect(result.files["avatar"]![0]!.filename).toBe("pic.png");
    expect(result.files["avatar"]![0]!.mimetype).toBe("image/png");
    expect(result.files["avatar"]![0]!.storageType).toBe("memory");
    expect(result.files["avatar"]![0]!.bufferContent?.toString()).toBe("binary-png-data");
  });

  it("parses disk files and writes to destination directory", async () => {
    const payload = createMultipartPayload(boundary, {}, [
      { field: "doc", filename: "sample.txt", contentType: "text/plain", content: "file disk content" },
    ]);

    const stream = Readable.from(payload);
    const result = await parseMultipart(stream, defaultHeaders, {
      storage: "disk",
      dest: os.tmpdir(),
    });

    const file = result.files["doc"]![0]!;
    expect(file.storageType).toBe("disk");
    expect(file.path).toBeDefined();
    expect(fs.existsSync(file.path!)).toBe(true);

    const fileData = fs.readFileSync(file.path!, "utf-8");
    expect(fileData).toBe("file disk content");

    await file.destroy();
    expect(fs.existsSync(file.path!)).toBe(false);
  });

  it("skips files with empty filename attribute", async () => {
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="emptyFile"; filename=""\r\nContent-Type: text/plain\r\n\r\n\r\n--${boundary}--\r\n`,
    );

    const stream = Readable.from(payload);
    const result = await parseMultipart(stream, defaultHeaders, { storage: "memory" });

    expect(result.files["emptyFile"]).toBeUndefined();
  });

  it("aborts and returns 422 UnprocessableEntityError on disallowed MIME type", async () => {
    const payload = createMultipartPayload(boundary, {}, [
      { field: "script", filename: "malicious.sh", contentType: "application/x-sh", content: "rm -rf" },
    ]);

    const stream = Readable.from(payload);
    await expect(
      parseMultipart(stream, defaultHeaders, {
        storage: "memory",
        allowedMimeTypes: ["image/jpeg", "image/png"],
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("aborts and returns 413 PayloadTooLargeError when file limit exceeded", async () => {
    const payload = createMultipartPayload(boundary, {}, [
      { field: "large", filename: "large.bin", contentType: "application/octet-stream", content: "a".repeat(100) },
    ]);

    const stream = Readable.from(payload);
    await expect(
      parseMultipart(stream, defaultHeaders, {
        storage: "memory",
        limits: { fileSize: 10 },
      }),
    ).rejects.toThrow(PayloadTooLargeError);
  });

  it("handles incoming request stream 'aborted' event cleanly", async () => {
    const stream = new PassThrough();
    const parsePromise = parseMultipart(stream, defaultHeaders, { storage: "memory" });

    stream.emit("aborted");

    await expect(parsePromise).rejects.toThrow(BadRequestError);
  });

  it("handles incoming request stream 'error' event cleanly", async () => {
    const stream = new PassThrough();
    const parsePromise = parseMultipart(stream, defaultHeaders, { storage: "memory" });

    stream.emit("error", new Error("Socket connection reset"));

    await expect(parsePromise).rejects.toThrow("Socket connection reset");
  });
});