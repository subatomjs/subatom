import * as fs from "node:fs";
import type { ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resSendFile } from "../../../package/core/http/streams/methods/file/resSendFile.js";

vi.mock("node:fs");

describe("resSendFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function createMockResponse(overrides: Partial<ServerResponse> = {}) {
		const res = new PassThrough() as unknown as ServerResponse;
		res.statusCode = 200;
		res.setHeader = vi.fn();
		res.end = vi.fn().mockImplementation((chunk, cb) => {
			if (typeof chunk === "function") chunk();
			if (typeof cb === "function") cb();
			return res;
		});
		res.destroy = vi.fn();
		Object.defineProperty(res, "headersSent", {
			value: overrides.headersSent ?? false,
			writable: true,
			configurable: true,
		});
		Object.assign(res, overrides);
		return res;
	}

	it("should throw error if headers are already sent", () => {
		const res = createMockResponse({ headersSent: true });

		expect(() => resSendFile(res, "/path/to/file.txt")).toThrow(
			"[Subatom File Error]: Headers already sent.",
		);
	});

	it("should return 403 Forbidden on path traversal attempts outside root", () => {
		const res = createMockResponse();

		resSendFile(res, "../../../etc/passwd", { root: "/var/www/public" });

		expect(res.statusCode).toBe(403);
		expect(res.end).toHaveBeenCalledWith(
			"Forbidden: Path traversal restriction.",
		);
	});

	it("should return 404 if file does not exist or stat fails", () => {
		const res = createMockResponse();
		vi.spyOn(fs, "stat").mockImplementation((filePath, cb: any) => {
			cb(new Error("ENOENT"), null);
		});

		resSendFile(res, "missing.txt", { root: "/var/www/public" });

		expect(res.statusCode).toBe(404);
		expect(res.end).toHaveBeenCalledWith("File Not Found");
	});

	it("should return 404 if path is a directory instead of a file", () => {
		const res = createMockResponse();
		vi.spyOn(fs, "stat").mockImplementation((filePath, cb: any) => {
			cb(null, { isFile: () => false, size: 4096 } as fs.Stats);
		});

		resSendFile(res, "somedir", { root: "/var/www/public" });

		expect(res.statusCode).toBe(404);
		expect(res.end).toHaveBeenCalledWith("File Not Found");
	});

	it("should set headers, pipe stream, and respond 200 on success", () => {
		const res = createMockResponse();
		const fakeFileStream = new PassThrough();

		vi.spyOn(fs, "stat").mockImplementation((filePath, cb: any) => {
			cb(null, { isFile: () => true, size: 1234 } as fs.Stats);
		});
		vi.spyOn(fs, "createReadStream").mockReturnValue(fakeFileStream as any);

		resSendFile(res, "app.js", {
			root: "/var/www/public",
			contentType: "application/javascript",
		});

		expect(res.statusCode).toBe(200);
		expect(res.setHeader).toHaveBeenCalledWith(
			"Content-Type",
			"application/javascript",
		);
		expect(res.setHeader).toHaveBeenCalledWith("Content-Length", "1234");
	});

	it("should handle read stream error before headersSent by responding 500", () => {
		const res = createMockResponse();
		const fakeFileStream = new PassThrough();

		vi.spyOn(fs, "stat").mockImplementation((filePath, cb: any) => {
			cb(null, { isFile: () => true, size: 500 } as fs.Stats);
		});
		vi.spyOn(fs, "createReadStream").mockReturnValue(fakeFileStream as any);

		resSendFile(res, "file.txt");

		fakeFileStream.emit("error", new Error("Disk error"));

		expect(res.statusCode).toBe(500);
		expect(res.end).toHaveBeenCalledWith("Failed to read file.");
	});

	it("should destroy response if file stream fails after headersSent", () => {
		const res = createMockResponse();
		const fakeFileStream = new PassThrough();

		vi.spyOn(fs, "stat").mockImplementation((filePath, cb: any) => {
			cb(null, { isFile: () => true, size: 500 } as fs.Stats);
		});
		vi.spyOn(fs, "createReadStream").mockReturnValue(fakeFileStream as any);

		resSendFile(res, "file.txt");

		(res as any).headersSent = true;
		const streamErr = new Error("Late disk failure");
		fakeFileStream.emit("error", streamErr);

		expect(res.destroy).toHaveBeenCalledWith(streamErr);
	});
});
