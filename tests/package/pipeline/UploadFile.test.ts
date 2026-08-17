/// <reference types="node" />

import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadFile } from "../../../package/core/pipeline/file-system/UploadFile.js";

vi.mock("node:fs");
vi.mock("node:fs/promises");

describe("UploadFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Memory Storage Strategy", () => {
		it("correctly initializes properties for memory files", () => {
			const buf = Buffer.from("hello world");
			const file = new UploadFile({
				filename: "test.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
				buffer: buf,
				size: buf.length,
			});

			expect(file.filename).toBe("test.txt");
			expect(file.encoding).toBe("7bit");
			expect(file.mimetype).toBe("text/plain");
			expect(file.storageType).toBe("memory");
			expect(file.size).toBe(11);
			expect(file.path).toBeUndefined();
			expect(file.destroyed).toBe(false);
			expect(file.bufferContent).toBe(buf);
		});

		it("returns memory buffer on buffer() call", async () => {
			const buf = Buffer.from("memory payload");
			const file = new UploadFile({
				filename: "doc.pdf",
				encoding: "utf-8",
				mimetype: "application/pdf",
				storageType: "memory",
				buffer: buf,
			});

			const result = await file.buffer();
			expect(result).toBe(buf);
		});

		it("returns a Readable stream for in-memory buffer", async () => {
			const buf = Buffer.from("stream content");
			const file = new UploadFile({
				filename: "stream.txt",
				encoding: "utf-8",
				mimetype: "text/plain",
				storageType: "memory",
				buffer: buf,
			});

			const stream = file.stream();
			expect(stream).toBeInstanceOf(Readable);

			const chunks: Buffer[] = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}
			expect(Buffer.concat(chunks).toString()).toBe("stream content");
		});

		it("destroys in-memory file references cleanly", async () => {
			const buf = Buffer.from("data");
			const file = new UploadFile({
				filename: "test.bin",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "memory",
				buffer: buf,
			});

			await file.destroy();
			expect(file.destroyed).toBe(true);
			expect(file.bufferContent).toBeUndefined();

			// Repeated destroy is a safe no-op
			await expect(file.destroy()).resolves.toBeUndefined();
		});

		it("throws when accessing buffer or stream after destroy", async () => {
			const file = new UploadFile({
				filename: "test.bin",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "memory",
				buffer: Buffer.from("data"),
			});

			await file.destroy();
			await expect(file.buffer()).rejects.toThrow(
				"Cannot access buffer of destroyed UploadFile.",
			);
			expect(() => file.stream()).toThrow(
				"Cannot create stream for destroyed UploadFile.",
			);
		});
	});

	describe("Disk Storage Strategy", () => {
		it("correctly initializes disk-backed file properties", () => {
			const file = new UploadFile({
				filename: "avatar.png",
				encoding: "binary",
				mimetype: "image/png",
				storageType: "disk",
				path: "/tmp/avatar-123.png",
				size: 2048,
			});

			expect(file.storageType).toBe("disk");
			expect(file.path).toBe("/tmp/avatar-123.png");
			expect(file.size).toBe(2048);
			expect(file.bufferContent).toBeUndefined();
		});

		it("reads buffer from disk when buffer() is invoked", async () => {
			const expectedBuffer = Buffer.from("disk file data");
			vi.mocked(fsPromises.readFile).mockResolvedValue(expectedBuffer);

			const file = new UploadFile({
				filename: "data.csv",
				encoding: "utf-8",
				mimetype: "text/csv",
				storageType: "disk",
				path: "/tmp/data.csv",
			});

			const res = await file.buffer();
			expect(fsPromises.readFile).toHaveBeenCalledWith("/tmp/data.csv");
			expect(res).toBe(expectedBuffer);
		});

		it("returns fs.createReadStream when stream() is called", () => {
			const dummyStream = new Readable({ read() {} });
			vi.mocked(fs.createReadStream).mockReturnValue(dummyStream as any);

			const file = new UploadFile({
				filename: "video.mp4",
				encoding: "binary",
				mimetype: "video/mp4",
				storageType: "disk",
				path: "/tmp/video.mp4",
			});

			const resultStream = file.stream();
			expect(fs.createReadStream).toHaveBeenCalledWith("/tmp/video.mp4");
			expect(resultStream).toBe(dummyStream);
		});

		it("unlinks temp file when destroyed and swallows unlink errors", async () => {
			vi.mocked(fsPromises.unlink).mockRejectedValue(new Error("ENOENT"));

			const file = new UploadFile({
				filename: "temp.tmp",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "disk",
				path: "/tmp/temp.tmp",
			});

			await expect(file.destroy()).resolves.toBeUndefined();
			expect(fsPromises.unlink).toHaveBeenCalledWith("/tmp/temp.tmp");
			expect(file.destroyed).toBe(true);
		});

		it("throws when file content or stream is unavailable", async () => {
			const invalidFile = new UploadFile({
				filename: "ghost.txt",
				encoding: "utf-8",
				mimetype: "text/plain",
				storageType: "disk",
				path: undefined,
			});

			await expect(invalidFile.buffer()).rejects.toThrow(
				"File content unavailable.",
			);
			expect(() => invalidFile.stream()).toThrow("File stream unavailable.");
		});
	});
});
