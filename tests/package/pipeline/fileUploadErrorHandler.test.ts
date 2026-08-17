import { describe, it, expect, vi } from "vitest";
import { fileUploadErrorHandler } from "../../../package/core/pipeline/file-system/fileUploadErrorHandler.js";
import {
  BadRequestError,
  PayloadTooLargeError,
  UnprocessableEntityError,
} from "../../../package/core/http/errors/Error.js";

describe("fileUploadErrorHandler", () => {
  it("calls next() if err is null/undefined", () => {
    const next = vi.fn();
    fileUploadErrorHandler(null, {} as any, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("handles wrapped request raw.writeHead responses", () => {
    const res = {
      raw: {
        headersSent: false,
        writeHead: vi.fn(),
        end: vi.fn(),
      },
    };
    const next = vi.fn();

    fileUploadErrorHandler(new PayloadTooLargeError("Too big"), {} as any, res, next);

    expect(res.raw.writeHead).toHaveBeenCalledWith(413, { "Content-Type": "application/json" });
    expect(res.raw.end).toHaveBeenCalledWith(JSON.stringify({ error: "Too big" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("handles Express-like res.status().json() responses", () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    fileUploadErrorHandler(new UnprocessableEntityError("Invalid MIME"), {} as any, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid MIME" });
  });

  it("handles raw Node ServerResponse writeHead", () => {
    const res = {
      headersSent: false,
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    fileUploadErrorHandler(new BadRequestError("Bad Request"), {} as any, res, next);

    expect(res.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json" });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: "Bad Request" }));
  });

  it("rethrows error if response object matches no known API", () => {
    const res = {};
    const next = vi.fn();
    const err = new Error("Fatal");

    expect(() => {
      fileUploadErrorHandler(err, {} as any, res, next);
    }).toThrow("Fatal");
  });
});