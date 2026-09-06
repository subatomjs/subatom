/// <reference types="node" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import { Readable } from "node:stream";
import { FileUpload } from "../../../packages/pipelines/files/FileUpload.js";

vi.mock("node:fs", () => ({
	createReadStream: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	unlink: vi.fn(),
}));

describe("FileUpload", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Constructor & Accessors", () => {
		it("should initialize properties properly for memory storage", () => {
			const buffer = Buffer.from("hello world");
			const upload = new FileUpload({
				filename: "test.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
				buffer,
				size: 11,
			});

			expect(upload.filename).toBe("test.txt");
			expect(upload.encoding).toBe("7bit");
			expect(upload.mimetype).toBe("text/plain");
			expect(upload.storageType).toBe("memory");
			expect(upload.size).toBe(11);
			expect(upload.path).toBeUndefined();
			expect(upload.bufferContent).toBe(buffer);
			expect(upload.destroyed).toBe(false);
			expect(upload._isUploadFile).toBe(true);
		});

		it("should serialize metadata correctly to JSON", () => {
			const upload = new FileUpload({
				filename: "sample.png",
				encoding: "binary",
				mimetype: "image/png",
				storageType: "disk",
				path: "/tmp/sample.png",
				size: 2048,
			});

			expect(upload.toJSON()).toEqual({
				filename: "sample.png",
				encoding: "binary",
				mimetype: "image/png",
				storageType: "disk",
				size: 2048,
				path: "/tmp/sample.png",
			});
		});
	});

	describe("Symbol.hasInstance", () => {
		it("should return false for primitives and nullish values", () => {
			expect((null as unknown as object) instanceof FileUpload).toBe(false);
			expect((undefined as unknown as object) instanceof FileUpload).toBe(false);
			expect(("string" as unknown as object) instanceof (FileUpload as unknown as { new (): unknown })).toBe(false);
			expect((123 as unknown as object) instanceof (FileUpload as unknown as { new (): unknown })).toBe(false);
			expect((true as unknown as object) instanceof (FileUpload as unknown as { new (): unknown })).toBe(false);
		});

		it("should recognize an actual FileUpload instance", () => {
			const upload = new FileUpload({
				filename: "doc.pdf",
				encoding: "7bit",
				mimetype: "application/pdf",
				storageType: "memory",
			});
			expect(upload instanceof FileUpload).toBe(true);
		});

		it("should validate cross-realm duck-typed candidate object", () => {
			const duckCandidate = {
				filename: "report.pdf",
				stream: () => new Readable(),
				buffer: async () => Buffer.from([]),
				destroy: async () => {},
			};
			expect(duckCandidate instanceof FileUpload).toBe(true);
		});

		it("should reject an object missing required duck-typed methods", () => {
			const invalidCandidate = {
				filename: "report.pdf",
				stream: () => new Readable(),
				buffer: async () => Buffer.from([]),
			};
			expect(invalidCandidate instanceof FileUpload).toBe(false);
		});
	});

	describe("buffer()", () => {
		it("should throw error if file is already destroyed", async () => {
			const upload = new FileUpload({
				filename: "doc.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
				buffer: Buffer.from("data"),
			});

			await upload.destroy();
			await expect(upload.buffer()).rejects.toThrow("Cannot access buffer of destroyed UploadFile.");
		});

		it("should return buffer directly for memory storage", async () => {
			const raw = Buffer.from("in-memory-content");
			const upload = new FileUpload({
				filename: "doc.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
				buffer: raw,
			});

			const result = await upload.buffer();
			expect(result).toBe(raw);
		});

		it("should read from disk when path exists", async () => {
			const diskBuffer = Buffer.from("disk-content");
			vi.mocked(fsPromises.readFile).mockResolvedValueOnce(diskBuffer);

			const upload = new FileUpload({
				filename: "doc.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "disk",
				path: "/var/tmp/upload.txt",
			});

			const result = await upload.buffer();
			expect(fsPromises.readFile).toHaveBeenCalledWith("/var/tmp/upload.txt");
			expect(result).toBe(diskBuffer);
		});

		it("should throw when neither buffer nor path is available", async () => {
			const upload = new FileUpload({
				filename: "doc.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
			});

			await expect(upload.buffer()).rejects.toThrow("File content unavailable.");
		});
	});

	describe("stream()", () => {
		it("should throw error if file is already destroyed", async () => {
			const upload = new FileUpload({
				filename: "doc.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
				buffer: Buffer.from("data"),
			});

			await upload.destroy();
			expect(() => upload.stream()).toThrow("Cannot create stream for destroyed UploadFile.");
		});

		it("should return readable stream from buffer for memory storage", async () => {
			const upload = new FileUpload({
				filename: "doc.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
				buffer: Buffer.from("stream-data"),
			});

			const stream = upload.stream();
			expect(stream).toBeInstanceOf(Readable);

			const chunks: Buffer[] = [];
			for await (const chunk of stream) {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			}
			expect(Buffer.concat(chunks).toString()).toBe("stream-data");
		});

		it("should create stream using fs.createReadStream when path exists", () => {
			const mockStream = new Readable({ read() {} }) as unknown as fs.ReadStream;
			vi.mocked(fs.createReadStream).mockReturnValueOnce(mockStream);

			const upload = new FileUpload({
				filename: "file.bin",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "disk",
				path: "/data/file.bin",
			});

			const stream = upload.stream();
			expect(fs.createReadStream).toHaveBeenCalledWith("/data/file.bin");
			expect(stream).toBe(mockStream);
		});

		it("should throw when neither memory buffer nor path is present", () => {
			const upload = new FileUpload({
				filename: "file.bin",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "disk",
			});

			expect(() => upload.stream()).toThrow("File stream unavailable.");
		});
	});

	describe("destroy()", () => {
		it("should clean up disk files and ignore unlink failure", async () => {
			vi.mocked(fsPromises.unlink).mockRejectedValueOnce(new Error("ENOENT"));

			const upload = new FileUpload({
				filename: "file.bin",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "disk",
				path: "/tmp/not-found.bin",
			});

			await expect(upload.destroy()).resolves.toBeUndefined();
			expect(upload.destroyed).toBe(true);
			expect(fsPromises.unlink).toHaveBeenCalledWith("/tmp/not-found.bin");
		});

		it("should be idempotent and skip multiple unlinks", async () => {
			vi.mocked(fsPromises.unlink).mockResolvedValue(undefined);

			const upload = new FileUpload({
				filename: "file.bin",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "disk",
				path: "/tmp/sample.bin",
				buffer: Buffer.from("abc"),
			});

			await upload.destroy();
			expect(upload.bufferContent).toBeUndefined();
			expect(fsPromises.unlink).toHaveBeenCalledTimes(1);

			await upload.destroy();
			expect(fsPromises.unlink).toHaveBeenCalledTimes(1);
		});

		it("should clear memory buffer when destroying memory storage", async () => {
			const upload = new FileUpload({
				filename: "file.bin",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "memory",
				buffer: Buffer.from("data"),
			});

			expect(upload.bufferContent).toBeDefined();
			await upload.destroy();
			expect(upload.bufferContent).toBeUndefined();
			expect(fsPromises.unlink).not.toHaveBeenCalled();
		});
	});
});