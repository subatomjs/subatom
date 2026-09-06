/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
/** biome-ignore-all lint/complexity/useLiteralKeys: explanation */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, PassThrough } from "node:stream";
import fs from "node:fs";
import { parseMultipart } from "../../../packages/pipelines/files/parseMultipart.js";
import {
	BadRequestError,
	PayloadTooLargeError,
	UnprocessableEntityError,
} from "../../../packages/errors/Errors.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	const unlinkMock = vi.fn().mockResolvedValue(undefined);
	const mkdirMock = vi.fn().mockResolvedValue(undefined);

	return {
		...actual,
		default: {
			...actual,
			createWriteStream: vi.fn(),
			promises: {
				...actual.promises,
				mkdir: mkdirMock,
				unlink: unlinkMock,
			},
		},
		createWriteStream: vi.fn(),
		promises: {
			...actual.promises,
			mkdir: mkdirMock,
			unlink: unlinkMock,
		},
	};
});

function createMultipartPayload(
	fields: Array<{ name: string; value: string }>,
	files: Array<{
		name: string;
		filename: string;
		contentType: string;
		content: Buffer;
	}>,
	boundary: string = "----SubatomTestBoundary",
): { stream: Readable; headers: Record<string, string> } {
	const stream = new PassThrough();

	for (const field of fields) {
		stream.write(`--${boundary}\r\n`);
		stream.write(
			`Content-Disposition: form-data; name="${field.name}"\r\n\r\n`,
		);
		stream.write(`${field.value}\r\n`);
	}

	for (const file of files) {
		stream.write(`--${boundary}\r\n`);
		stream.write(
			`Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`,
		);
		stream.write(`Content-Type: ${file.contentType}\r\n\r\n`);
		stream.write(file.content);
		stream.write("\r\n");
	}

	stream.write(`--${boundary}--\r\n`);
	stream.end();

	return {
		stream,
		headers: {
			"content-type": `multipart/form-data; boundary=${boundary}`,
		},
	};
}

describe("parseMultipart", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Directory creation", () => {
		it("should reject with BadRequestError if disk directory creation fails", async () => {
			vi.mocked(fs.promises.mkdir).mockRejectedValueOnce(
				new Error("Permission denied"),
			);

			const stream = new Readable({ read() {} });
			await expect(
				parseMultipart(
					stream,
					{ "content-type": "multipart/form-data; boundary=xyz" },
					{
						storage: "disk",
						dest: "/protected/path",
					},
				),
			).rejects.toThrow(BadRequestError);
		});
	});

	describe("Busboy initialization", () => {
		it("should reject with BadRequestError if busboy initialization throws", async () => {
			const stream = new Readable({ read() {} });
			await expect(
				parseMultipart(
					stream,
					{ "content-type": "invalid-multipart" },
					{ storage: "memory" },
				),
			).rejects.toThrow(BadRequestError);
		});
	});

	describe("Field coercion & array aggregation", () => {
		it("should parse boolean, null, numbers, JSON, and maintain repeated fields as array", async () => {
			const { stream, headers } = createMultipartPayload(
				[
					{ name: "isTrue", value: "true" },
					{ name: "isFalse", value: "false" },
					{ name: "empty", value: "null" },
					{ name: "counter", value: "42" },
					{ name: "float", value: "-12.34" },
					{ name: "phoneWithLeadingZero", value: "01234" },
					{ name: "zeroValue", value: "0" },
					{ name: "zeroPointValue", value: "0.99" },
					{ name: "jsonObj", value: '{"key":"value"}' },
					{ name: "jsonArr", value: "[1, 2, 3]" },
					{ name: "invalidJson", value: "{bad-json}" },
					{ name: "multi", value: "item1" },
					{ name: "multi", value: "item2" },
					{ name: "multi", value: "item3" },
				],
				[],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "memory",
			});

			expect(result.body).toEqual({
				isTrue: true,
				isFalse: false,
				empty: null,
				counter: 42,
				float: -12.34,
				phoneWithLeadingZero: "01234",
				zeroValue: 0,
				zeroPointValue: 0.99,
				jsonObj: { key: "value" },
				jsonArr: [1, 2, 3],
				invalidJson: "{bad-json}",
				multi: ["item1", "item2", "item3"],
			});
			expect(result.files).toEqual({});
		});
	});

	describe("File handling & MIME type resolution", () => {
		it("should resolve extension-based MIME when client passes generic application/octet-stream", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "document",
						filename: "file.pdf",
						contentType: "application/octet-stream",
						content: Buffer.from("%PDF-1.4"),
					},
					{
						name: "image",
						filename: "vector.svg",
						contentType: "image/svg",
						content: Buffer.from("<svg></svg>"),
					},
					{
						name: "bin",
						filename: "file.zip",
						contentType: "binary/octet-stream",
						content: Buffer.from("PK"),
					},
				],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "memory",
			});
			expect(result.files["document"]?.[0]?.mimetype).toBe("application/pdf");
			expect(result.files["image"]?.[0]?.mimetype).toBe("image/svg+xml");
			expect(result.files["bin"]?.[0]?.mimetype).toBe("application/zip");
		});

		it("should cover line 122 (exact match targetMime === target) and line 127 (target.replace(/^./, '') === ext)", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "exactMatch",
						filename: "file.custom",
						contentType: "application/x-custom",
						content: Buffer.from("custom-data"),
					},
					{
						name: "extWithDotMatch",
						filename: "picture.png",
						contentType: "image/png",
						content: Buffer.from("png-data"),
					},
				],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "memory",
				allowedMimeTypes: ["application/x-custom", ".png"],
			});

			expect(result.files["exactMatch"]?.[0]?.mimetype).toBe(
				"application/x-custom",
			);
			expect(result.files["extWithDotMatch"]?.[0]?.mimetype).toBe("image/png");
		});

		it("should allow matching via wildcard prefix, wildcard '*', and exact match", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "f1",
						filename: "photo.jpg",
						contentType: "image/jpeg",
						content: Buffer.from("jpg"),
					},
					{
						name: "f2",
						filename: "exact.json",
						contentType: "application/json",
						content: Buffer.from("{}"),
					},
					{
						name: "f3",
						filename: "any.bin",
						contentType: "application/octet-stream",
						content: Buffer.from([0]),
					},
				],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "memory",
				allowedMimeTypes: ["image/*", "application/json", "*"],
			});

			expect(result.files["f1"]?.[0]?.mimetype).toBe("image/jpeg");
			expect(result.files["f2"]?.[0]?.mimetype).toBe("application/json");
			expect(result.files["f3"]?.[0]?.mimetype).toBe(
				"application/octet-stream",
			);
		});

		it("should allow the SVG MIME alias", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "vector",
						filename: "vector.svg",
						contentType: "image/svg+xml",
						content: Buffer.from("<svg />"),
					},
				],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "memory",
				allowedMimeTypes: ["image/svg"],
			});

			expect(result.files.vector?.[0]?.mimetype).toBe("image/svg+xml");
		});

		it("should append multiple files under the same field name", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "docs",
						filename: "doc1.txt",
						contentType: "text/plain",
						content: Buffer.from("First"),
					},
					{
						name: "docs",
						filename: "doc2.txt",
						contentType: "text/plain",
						content: Buffer.from("Second"),
					},
				],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "memory",
			});
			expect(result.files["docs"]).toHaveLength(2);
			expect(result.files["docs"]?.[0]?.filename).toBe("doc1.txt");
			expect(result.files["docs"]?.[1]?.filename).toBe("doc2.txt");
		});

		it("should skip processing if file has no filename", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "unnamed",
						filename: "",
						contentType: "text/plain",
						content: Buffer.from("content"),
					},
				],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "memory",
			});
			expect(result.files["unnamed"]).toBeUndefined();
		});

		it("should reject with UnprocessableEntityError when MIME is disallowed", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "avatar",
						filename: "malicious.exe",
						contentType: "application/x-msdownload",
						content: Buffer.from("MZ"),
					},
				],
			);

			await expect(
				parseMultipart(stream, headers, {
					storage: "memory",
					allowedMimeTypes: ["image/*", ".png", "application/pdf"],
				}),
			).rejects.toThrow(UnprocessableEntityError);
		});
	});

	describe("Stream lifecycle and events in memory mode (lines 230-231, 263-264, 270-271)", () => {
		it("should resume a file stream emitted after parsing has been aborted", async () => {
			const stream = new PassThrough();
			const headers = {
				"content-type": "multipart/form-data; boundary=----AfterAbort",
			};
			const parsePromise = parseMultipart(stream, headers, {
				storage: "memory",
			});
			const pipes = (
				stream as unknown as { _readableState?: { pipes?: unknown } }
			)?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;
			const fileStream = new PassThrough();
			const resumeSpy = vi.spyOn(fileStream, "resume");

			stream.emit("aborted");
			bbInstance.emit("file", "late", fileStream, {
				filename: "late.txt",
				encoding: "7bit",
				mimeType: "text/plain",
			});

			await expect(parsePromise).rejects.toThrow("Client aborted the upload");
			expect(resumeSpy).toHaveBeenCalled();
		});

		it("should resume and ignore a file event without a filename", async () => {
			const stream = new PassThrough();
			const headers = {
				"content-type": "multipart/form-data; boundary=----NoFilename",
			};
			const parsePromise = parseMultipart(stream, headers, {
				storage: "memory",
			});
			const pipes = (
				stream as unknown as { _readableState?: { pipes?: unknown } }
			)?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;
			const fileStream = new PassThrough();
			const resumeSpy = vi.spyOn(fileStream, "resume");

			bbInstance.emit("file", "unnamed", fileStream, {
				filename: "",
				encoding: "7bit",
				mimeType: "text/plain",
			});
			bbInstance.emit("finish");

			const result = await parsePromise;
			expect(resumeSpy).toHaveBeenCalled();
			expect(result.files.unnamed).toBeUndefined();
		});

		it("should resolve without creating an upload for a truncated file stream", async () => {
			const stream = new PassThrough();
			const headers = {
				"content-type": "multipart/form-data; boundary=----Truncated",
			};
			const parsePromise = parseMultipart(stream, headers, {
				storage: "memory",
			});
			const pipes = (
				stream as unknown as { _readableState?: { pipes?: unknown } }
			)?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;
			const fileStream = new PassThrough() as PassThrough & {
				truncated?: boolean;
			};
			fileStream.truncated = true;

			bbInstance.emit("file", "truncated", fileStream, {
				filename: "truncated.txt",
				encoding: "7bit",
				mimeType: "text/plain",
			});
			fileStream.on("end", () => bbInstance.emit("finish"));
			fileStream.push(Buffer.from("partial"));
			fileStream.push(null);

			const result = await parsePromise;
			expect(result.files.truncated).toBeUndefined();
		});

		it("should trigger fileStream close event (lines 263-264)", async () => {
			const boundary = "----BoundaryMemCloseDirect";
			const headers = {
				"content-type": `multipart/form-data; boundary=${boundary}`,
			};
			const stream = new PassThrough();

			const parsePromise = parseMultipart(stream, headers, {
				storage: "memory",
			});

			const pipes = (
				stream as unknown as { _readableState?: { pipes?: unknown } }
			)?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;

			const memStream = new PassThrough();
			bbInstance.emit("file", "memClose", memStream, {
				filename: "close.txt",
				encoding: "7bit",
				mimeType: "text/plain",
			});

			memStream.push(Buffer.from("data"));
			memStream.push(null);
			// Directly emit close on the fileStream
			memStream.emit("close");

			bbInstance.emit("finish");

			const res = await parsePromise;

			expect(res.files["memClose"]).toBeDefined();
		});

		it("should reject when fileStream emits an error event in memory mode (lines 270-271)", async () => {
			const boundary = "----BoundaryMemErrDirect";
			const headers = {
				"content-type": `multipart/form-data; boundary=${boundary}`,
			};
			const stream = new PassThrough();

			const parsePromise = parseMultipart(stream, headers, {
				storage: "memory",
			});

			const pipes = (
				stream as unknown as { _readableState?: { pipes?: unknown } }
			)?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;

			const erroredStream = new PassThrough();
			bbInstance.emit("file", "errField", erroredStream, {
				filename: "bad.txt",
				encoding: "7bit",
				mimeType: "text/plain",
			});

			process.nextTick(() => {
				erroredStream.emit(
					"error",
					new Error("Simulated memory stream failure"),
				);
			});

			await expect(parsePromise).rejects.toThrow(
				"File stream error on field 'errField': Simulated memory stream failure",
			);
		});

		it("should reject when fileStream emits limit event in memory mode (lines 230-231)", async () => {
			const boundary = "----BoundaryMemLimitDirect";
			const headers = {
				"content-type": `multipart/form-data; boundary=${boundary}`,
			};
			const stream = new PassThrough();

			const parsePromise = parseMultipart(stream, headers, {
				storage: "memory",
			});

			const pipes = (
				stream as unknown as { _readableState?: { pipes?: unknown } }
			)?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;

			const limitStream = new PassThrough();
			bbInstance.emit("file", "limitedField", limitStream, {
				filename: "limit.txt",
				encoding: "7bit",
				mimeType: "text/plain",
			});

			process.nextTick(() => {
				limitStream.emit("limit");
			});

			await expect(parsePromise).rejects.toThrow(PayloadTooLargeError);
		});
	});

	describe("Disk storage strategy", () => {
		it("should stream to disk and record FileUpload instance with file path", async () => {
			const mockWriteStream = new PassThrough() as unknown as fs.WriteStream & {
				bytesWritten: number;
			};
			mockWriteStream.bytesWritten = 14;

			vi.mocked(fs.createWriteStream).mockImplementationOnce(() => {
				setTimeout(() => {
					mockWriteStream.emit("finish");
					mockWriteStream.emit("close");
				}, 10);
				return mockWriteStream;
			});

			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "upload",
						filename: "example.png",
						contentType: "image/png",
						content: Buffer.from("fake-image-png"),
					},
				],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "disk",
				dest: "/tmp/custom-uploads",
			});

			expect(result.files["upload"]).toHaveLength(1);
			const saved = result.files["upload"]?.[0];
			expect(saved?.storageType).toBe("disk");
			expect(saved?.path).toContain("example.png");
			expect(saved?.size).toBe(14);
		});

		it("should reject and cleanup if outStream emits error", async () => {
			const errorWriteStream = new PassThrough() as unknown as fs.WriteStream;
			vi.mocked(fs.createWriteStream).mockImplementationOnce(() => {
				errorWriteStream.on("pipe", () => {
					process.nextTick(() => {
						errorWriteStream.emit("error", new Error("Disk write failure"));
					});
				});
				return errorWriteStream;
			});

			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "upload",
						filename: "fail.txt",
						contentType: "text/plain",
						content: Buffer.from("content"),
					},
				],
			);

			await expect(
				parseMultipart(stream, headers, { storage: "disk" }),
			).rejects.toThrow(BadRequestError);
			expect(fs.promises.unlink).toHaveBeenCalled();
		});

		it("should reject and cleanup if fileStream emits error in disk mode", async () => {
			const dummyWriteStream = new PassThrough() as unknown as fs.WriteStream;
			vi.mocked(fs.createWriteStream).mockReturnValueOnce(dummyWriteStream);

			const boundary = "----BoundaryFailDiskTest";
			const headers = {
				"content-type": `multipart/form-data; boundary=${boundary}`,
			};
			const stream = new PassThrough();

			const parsePromise = parseMultipart(stream, headers, { storage: "disk" });

			const pipes = (
				stream as unknown as { _readableState?: { pipes?: unknown } }
			)?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;

			const erroredFileStream = new PassThrough();
			bbInstance.emit("file", "corrupt", erroredFileStream, {
				filename: "corrupt.txt",
				encoding: "7bit",
				mimeType: "text/plain",
			});

			process.nextTick(() => {
				erroredFileStream.emit(
					"error",
					new Error("Simulated file read failure"),
				);
			});

			await expect(parsePromise).rejects.toThrow(BadRequestError);
			expect(fs.promises.unlink).toHaveBeenCalled();
		});

		it("should trigger fileStream close event in disk mode", async () => {
			const dummyWriteStream = new PassThrough() as unknown as fs.WriteStream;
			vi.mocked(fs.createWriteStream).mockReturnValueOnce(dummyWriteStream);

			const boundary = "----BoundaryDiskClose";
			const headers = {
				"content-type": `multipart/form-data; boundary=${boundary}`,
			};
			const stream = new PassThrough();

			const parsePromise = parseMultipart(stream, headers, { storage: "disk" });

			const pipes = (
				stream as unknown as { _readableState?: { pipes?: unknown } }
			)?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;

			const diskFileStream = new PassThrough();
			bbInstance.emit("file", "diskClose", diskFileStream, {
				filename: "disk_close.txt",
				encoding: "7bit",
				mimeType: "text/plain",
			});

			diskFileStream.push(Buffer.from("data"));
			diskFileStream.push(null);
			diskFileStream.emit("close");
			dummyWriteStream.emit("finish");

			bbInstance.emit("finish");

			const res = await parsePromise;

			expect(res.files["diskClose"]).toBeDefined();
		});
	});

	describe("Limits & Abort Conditions", () => {
		it("should reject when fileStream emits limit in disk mode", async () => {
			const mockWriteStream = new PassThrough() as unknown as fs.WriteStream;
			vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream);

			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "largeDiskFile",
						filename: "large.bin",
						contentType: "application/octet-stream",
						content: Buffer.alloc(100),
					},
				],
			);

			await expect(
				parseMultipart(stream, headers, {
					storage: "disk",
					limits: { fileSize: 10 },
				}),
			).rejects.toThrow(PayloadTooLargeError);
		});

		it("should reject when client request stream emits aborted or error", async () => {
			const stream = new PassThrough();
			const headers = {
				"content-type": "multipart/form-data; boundary=----Aborted",
			};
			const promise = parseMultipart(stream, headers, { storage: "memory" });

			stream.emit("aborted");
			await expect(promise).rejects.toThrow("Client aborted the upload");

			const stream2 = new PassThrough();
			const promise2 = parseMultipart(stream2, headers, { storage: "memory" });
			stream2.emit("error", new Error("Socket reset"));
			await expect(promise2).rejects.toThrow(
				"Request stream error: Socket reset",
			);
		});

		it("should reject when busboy reaches partsLimit, filesLimit, or fieldsLimit", async () => {
			const runLimitTest = async (
				event: "partsLimit" | "filesLimit" | "fieldsLimit",
				expectedMessage: string,
			) => {
				const stream = new PassThrough();
				const headers = {
					"content-type": "multipart/form-data; boundary=----Limit",
				};
				const promise = parseMultipart(stream, headers, { storage: "memory" });

				setTimeout(() => {
					const pipes = (
						stream as unknown as { _readableState?: { pipes?: unknown } }
					)?._readableState?.pipes;
					const bbInstance = Array.isArray(pipes) ? pipes[0] : pipes;
					if (bbInstance && typeof bbInstance.emit === "function") {
						bbInstance.emit(event);
					}
				}, 10);

				await expect(promise).rejects.toThrow(expectedMessage);
			};

			await runLimitTest("partsLimit", "Multipart parts limit exceeded");
			await runLimitTest("filesLimit", "Multipart files limit exceeded");
			await runLimitTest("fieldsLimit", "Multipart fields limit exceeded");
		});

		it("should reject on Busboy general error", async () => {
			const stream = new PassThrough();
			const headers = {
				"content-type": "multipart/form-data; boundary=----Err",
			};
			const promise = parseMultipart(stream, headers, { storage: "memory" });

			setTimeout(() => {
				const pipes = (
					stream as unknown as { _readableState?: { pipes?: unknown } }
				)?._readableState?.pipes;
				const bbInstance = Array.isArray(pipes) ? pipes[0] : pipes;
				if (bbInstance && typeof bbInstance.emit === "function") {
					bbInstance.emit("error", new Error("Malformed boundary header"));
				}
			}, 10);

			await expect(promise).rejects.toThrow(
				"Multipart parsing error: Malformed boundary header",
			);
		});
	});
});
