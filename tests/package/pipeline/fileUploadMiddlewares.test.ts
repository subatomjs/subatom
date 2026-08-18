import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BadRequestError,
  PayloadTooLargeError,
  UnprocessableEntityError,
} from "../../../package/core/http/errors/Error.js";
import {
  anyFiles,
  array,
  fields,
  none,
  single,
} from "../../../package/core/pipeline/file-system/fileUploadPipe.js";
import * as parserModule from "../../../package/core/pipeline/file-system/multipartParser.js";
import { UploadFile } from "../../../package/core/pipeline/file-system/UploadFile.js";

function mockReqRes(
  headers: Record<string, string> = {
    "content-type": "multipart/form-data; boundary=xyz",
  },
  reqOverrides: Record<string, any> = {},
  resOverrides: Record<string, any> = {},
) {
  const req: any = {
    headers,
    getHeaders: () => headers,
    getStream: () => ({ unpipe: vi.fn(), resume: vi.fn() }),
    body: {},
    ...reqOverrides,
  };

  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    writeHead: vi.fn(),
    end: vi.fn(),
    headersSent: false,
    ...resOverrides,
  };

  const next = vi.fn();
  return { req, res, next };
}

function createFile(name: string, field = "file") {
  return new UploadFile({
    filename: name,
    encoding: "7bit",
    mimetype: "text/plain",
    storageType: "memory",
    buffer: Buffer.from("content"),
  });
}

describe("Enterprise Suite: File Upload Middlewares (100% Coverage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. getStreamAndHeaders & isMultipartRequest edge cases
  // ---------------------------------------------------------------------------
  describe("getStreamAndHeaders & isMultipartRequest Branches", () => {
    it("falls back to req.raw when getStream is not available", async () => {
      const rawStream = { pipe: vi.fn() };
      const req: any = {
        raw: rawStream,
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: {},
      });

      const mw = single("avatar");
      await mw(req, res, next);

      expect(parserModule.parseMultipart).toHaveBeenCalledWith(
        rawStream,
        req.headers,
        expect.any(Object),
      );
      expect(next).toHaveBeenCalledWith();
    });

    it("falls back to req itself when getStream and req.raw are not available", async () => {
      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: {},
      });

      const mw = single("avatar");
      await mw(req, res, next);

      expect(parserModule.parseMultipart).toHaveBeenCalledWith(
        req,
        req.headers,
        expect.any(Object),
      );
      expect(next).toHaveBeenCalledWith();
    });

    it("falls back to empty headers object when req.getHeaders and req.headers are undefined", async () => {
      const req: any = {
        getStream: () => ({}),
      };
      const res: any = {};
      const next = vi.fn();

      const mw = single("avatar");
      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("passes through immediately when content-type is non-multipart string", async () => {
      const { req, res, next } = mockReqRes({ "content-type": "application/json" });
      const mw = single("avatar");

      await mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. sendUploadError Internal Handler Variations
  // ---------------------------------------------------------------------------
  describe("sendUploadError Branches", () => {
    it("writes to res.raw when res.raw.writeHead exists and headersSent is false", async () => {
      const rawWriteHead = vi.fn();
      const rawEnd = vi.fn();
      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {
        raw: {
          writeHead: rawWriteHead,
          end: rawEnd,
          headersSent: false,
        },
      };
      const next = vi.fn();

      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new UnprocessableEntityError("Unprocessable file format"),
      );

      const mw = single("file");
      await mw(req, res, next);

      expect(rawWriteHead).toHaveBeenCalledWith(422, {
        "Content-Type": "application/json",
      });
      expect(rawEnd).toHaveBeenCalledWith(
        JSON.stringify({ error: "Unprocessable file format" }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("returns false and calls next(err) if res.raw.headersSent is true", async () => {
      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {
        raw: {
          writeHead: vi.fn(),
          end: vi.fn(),
          headersSent: true,
        },
      };
      const next = vi.fn();

      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new PayloadTooLargeError("File exceeds limit"),
      );

      const mw = single("file");
      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(PayloadTooLargeError));
    });

    it("writes using native res.writeHead and res.end when available", async () => {
      const writeHead = vi.fn();
      const end = vi.fn();
      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {
        writeHead,
        end,
        headersSent: false,
      };
      const next = vi.fn();

      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new BadRequestError("Bad Request Format"),
      );

      const mw = single("file");
      await mw(req, res, next);

      expect(writeHead).toHaveBeenCalledWith(400, {
        "Content-Type": "application/json",
      });
      expect(end).toHaveBeenCalledWith(
        JSON.stringify({ error: "Bad Request Format" }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("returns false and calls next(err) if res.writeHead exists but res.headersSent is true", async () => {
      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {
        writeHead: vi.fn(),
        end: vi.fn(),
        headersSent: true,
      };
      const next = vi.fn();

      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new Error("Random crash"),
      );

      const mw = single("file");
      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it("handles non-Error objects and defaults message to 'Internal server error' and status 500", async () => {
      const { req, res, next } = mockReqRes();

      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue("non-error-thrown");

      const mw = single("file");
      await mw(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
      expect(next).not.toHaveBeenCalled();
    });

    it("catches errors thrown during direct write and bubbles up to next(err)", async () => {
      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {
        status: () => {
          throw new Error("Cannot serialize response");
        },
        json: vi.fn(),
      };
      const next = vi.fn();

      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new BadRequestError("Invalid payload"),
      );

      const mw = single("file");
      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  // ---------------------------------------------------------------------------
  // 3. single() Middleware
  // ---------------------------------------------------------------------------
  describe("single()", () => {
    it("uses default storage option when options argument is omitted", () => {
      const mw = single("avatar");
      expect(mw._fileConfig).toEqual({
        type: "single",
        fieldname: "avatar",
        options: { storage: "memory" },
      });
    });

    it("attaches single file to req.file and req.files with custom storage options", async () => {
      const file = createFile("avatar.png", "avatar");
      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: { user: "alice" },
        files: { avatar: [file] },
      });

      const { req, res, next } = mockReqRes();
      const mw = single("avatar", { storage: "disk", dest: "/tmp/uploads" });

      await mw(req, res, next);

      expect(req.body.user).toBe("alice");
      expect(req.file).toBe(file);
      expect(req.files).toEqual({ avatar: [file] });
      expect(next).toHaveBeenCalledWith();
    });

    it("handles request when no file was provided for target field", async () => {
      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: { user: "bob" },
        files: {},
      });

      const { req, res, next } = mockReqRes();
      const mw = single("avatar");

      await mw(req, res, next);

      expect(req.body.user).toBe("bob");
      expect(req.file).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. array() Middleware
  // ---------------------------------------------------------------------------
  describe("array()", () => {
    it("uses default options when maxCount and options are omitted", () => {
      const mw = array("photos");
      expect(mw._fileConfig).toEqual({
        type: "array",
        fieldname: "photos",
        maxCount: undefined,
        options: { storage: "memory" },
      });
    });

    it("accepts multiple files within maxCount and sets req.file & req.files", async () => {
      const f1 = createFile("pic1.png", "photos");
      const f2 = createFile("pic2.png", "photos");
      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: { photos: [f1, f2] },
      });

      const { req, res, next } = mockReqRes();
      const mw = array("photos", 3);

      await mw(req, res, next);

      expect(req.files).toEqual([f1, f2]);
      expect(req.file).toBe(f1);
      expect(next).toHaveBeenCalledWith();
    });

    it("handles array upload with empty matching files", async () => {
      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: {},
      });

      const { req, res, next } = mockReqRes();
      const mw = array("photos", 2);

      await mw(req, res, next);

      expect(req.files).toEqual([]);
      expect(req.file).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects, cleans up, and directly responds with 413 when exceeding maxCount", async () => {
      const f1 = createFile("pic1.png");
      const f2 = createFile("pic2.png");
      const destroySpy1 = vi.spyOn(f1, "destroy");
      const destroySpy2 = vi.spyOn(f2, "destroy");

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: { photos: [f1, f2] },
      });

      const { req, res, next } = mockReqRes();
      const mw = array("photos", 1);

      await mw(req, res, next);

      expect(destroySpy1).toHaveBeenCalled();
      expect(destroySpy2).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Too many files"),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("calls next(err) when maxCount is exceeded and res cannot write directly", async () => {
      const f1 = createFile("pic1.png");
      const f2 = createFile("pic2.png");

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: { photos: [f1, f2] },
      });

      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {}; // Incompetent response object
      const next = vi.fn();

      const mw = array("photos", 1);
      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(PayloadTooLargeError));
    });

    it("handles thrown parseMultipart errors in array() and delegates to sendUploadError", async () => {
      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new BadRequestError("Malformed multipart"),
      );

      const { req, res, next } = mockReqRes();
      const mw = array("photos", 5);

      await mw(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. fields() Middleware
  // ---------------------------------------------------------------------------
  describe("fields()", () => {
    it("uses default options when options parameter is omitted", () => {
      const mw = fields([{ name: "avatar", maxCount: 1 }]);
      expect(mw._fileConfig).toEqual({
        type: "fields",
        fields: [{ name: "avatar", maxCount: 1 }],
        options: { storage: "memory" },
      });
    });

    it("handles fieldsConfig with null/undefined entries safely", async () => {
      const avatar = createFile("a.png", "avatar");

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: { avatar: [avatar] },
      });

      const { req, res, next } = mockReqRes();
      const configWithHole: any = [null, { name: "avatar" }, undefined];
      const mw = fields(configWithHole);

      await mw(req, res, next);

      expect(req.files).toEqual({ avatar: [avatar] });
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects and cleans up when a field exceeds maxCount and sends response directly", async () => {
      const a1 = createFile("a1.png");
      const a2 = createFile("a2.png");
      const destroySpy1 = vi.spyOn(a1, "destroy");
      const destroySpy2 = vi.spyOn(a2, "destroy");

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: { avatar: [a1, a2] },
      });

      const { req, res, next } = mockReqRes();
      const mw = fields([{ name: "avatar", maxCount: 1 }]);

      await mw(req, res, next);

      expect(destroySpy1).toHaveBeenCalled();
      expect(destroySpy2).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Exceeded maximum file count (1) for field 'avatar'",
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("calls next(err) when field limit is exceeded and res cannot write directly", async () => {
      const a1 = createFile("a1.png");
      const a2 = createFile("a2.png");

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: { avatar: [a1, a2] },
      });

      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {};
      const next = vi.fn();

      const mw = fields([{ name: "avatar", maxCount: 1 }]);
      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(PayloadTooLargeError));
    });

    it("handles parseMultipart error in fields()", async () => {
      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new BadRequestError("Invalid boundary"),
      );

      const { req, res, next } = mockReqRes();
      const mw = fields([{ name: "avatar" }]);

      await mw(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. anyFiles() Middleware
  // ---------------------------------------------------------------------------
  describe("anyFiles()", () => {
    it("uses default options when options parameter is omitted", () => {
      const mw = anyFiles();
      expect(mw._fileConfig).toEqual({
        type: "any",
        options: { storage: "memory" },
      });
    });

    it("handles parseMultipart error in anyFiles() and forwards to next(err) if res is invalid", async () => {
      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new Error("Stream parse error"),
      );

      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {};
      const next = vi.fn();

      const mw = anyFiles();
      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ---------------------------------------------------------------------------
  // 7. none() Middleware
  // ---------------------------------------------------------------------------
  describe("none()", () => {
    it("uses default options when options parameter is omitted", () => {
      const mw = none();
      expect(mw._fileConfig).toEqual({
        type: "none",
        options: { storage: "memory" },
      });
    });

    it("allows request with text body and no uploaded files", async () => {
      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: { key: "val" },
        files: {},
      });

      const { req, res, next } = mockReqRes();
      const mw = none();

      await mw(req, res, next);

      expect(req.body.key).toBe("val");
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects files, cleans up, and directly responds with 400", async () => {
      const f = createFile("file.txt");
      const destroySpy = vi.spyOn(f, "destroy");

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: { disallowed: [f] },
      });

      const { req, res, next } = mockReqRes();
      const mw = none();

      await mw(req, res, next);

      expect(destroySpy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "File uploads are not permitted on this endpoint",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("calls next(err) when files are rejected in none() and res cannot write directly", async () => {
      const f = createFile("file.txt");

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: { disallowed: [f] },
      });

      const req: any = {
        headers: { "content-type": "multipart/form-data; boundary=xyz" },
      };
      const res: any = {};
      const next = vi.fn();

      const mw = none();
      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it("handles parseMultipart error in none()", async () => {
      vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
        new BadRequestError("Corrupt stream"),
      );

      const { req, res, next } = mockReqRes();
      const mw = none();

      await mw(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 8. cleanupFiles Utility & Edge Cases
  // ---------------------------------------------------------------------------
  describe("cleanupFiles Edge Cases", () => {
    it("handles cleanupFiles with undefined/empty arrays or null items gracefully", async () => {
      const f1 = createFile("f1.txt");
      vi.spyOn(f1, "destroy").mockRejectedValue(new Error("Disk unlinking failed"));

      const filesMap: any = {
        fieldA: null,
        fieldB: [null, f1, undefined],
      };

      vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
        body: {},
        files: filesMap,
      });

      const { req, res, next } = mockReqRes();
      const mw = none();

      await mw(req, res, next);

      // Verify that the rejected destroy promise was swallowed and 400 was still sent
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "File uploads are not permitted on this endpoint",
      });
    });
  });
});