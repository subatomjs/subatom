import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, PassThrough, Writable } from "node:stream";
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
	files: Array<{ name: string; filename: string; contentType: string; content: Buffer }>,
	boundary: string = "----SubatomTestBoundary",
): { stream: Readable; headers: Record<string, string> } {
	const stream = new PassThrough();

	for (const field of fields) {
		stream.write(`--${boundary}\r\n`);
		stream.write(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n`);
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
			vi.mocked(fs.promises.mkdir).mockRejectedValueOnce(new Error("Permission denied"));

			const stream = new Readable({ read() {} });
			await expect(
				parseMultipart(stream, { "content-type": "multipart/form-data; boundary=xyz" }, {
					storage: "disk",
					dest: "/protected/path",
				}),
			).rejects.toThrow(BadRequestError);
		});
	});

	describe("Busboy initialization", () => {
		it("should reject with BadRequestError if busboy initialization throws", async () => {
			const stream = new Readable({ read() {} });
			await expect(
				parseMultipart(stream, { "content-type": "invalid-multipart" }, { storage: "memory" }),
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

			const result = await parseMultipart(stream, headers, { storage: "memory" });

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
				],
			);

			const result = await parseMultipart(stream, headers, { storage: "memory" });
			expect(result.files["document"]?.[0]?.mimetype).toBe("application/pdf");
			expect(result.files["image"]?.[0]?.mimetype).toBe("image/svg+xml");
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

			const result = await parseMultipart(stream, headers, { storage: "memory" });
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

		it("should permit wildcards and SVG aliasing matching in allowedMimeTypes", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "file1",
						filename: "icon.svg",
						contentType: "image/svg+xml",
						content: Buffer.from("<svg/>"),
					},
					{
						name: "file2",
						filename: "doc.txt",
						contentType: "text/plain",
						content: Buffer.from("hello"),
					},
				],
			);

			const result = await parseMultipart(stream, headers, {
				storage: "memory",
				allowedMimeTypes: ["image/svg", "*/*"],
			});

			expect(result.files["file1"]?.[0]?.filename).toBe("icon.svg");
			expect(result.files["file2"]?.[0]?.filename).toBe("doc.txt");
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
			const headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
			const stream = new PassThrough();

			const parsePromise = parseMultipart(stream, headers, { storage: "disk" });

			const pipes = (stream as unknown as { _readableState?: { pipes?: unknown } })
				?._readableState?.pipes;
			const bbInstance = (Array.isArray(pipes) ? pipes[0] : pipes) as any;

			// Construct mock file stream that errors mid-pipe
			const erroredFileStream = new PassThrough();
			bbInstance.emit(
				"file",
				"corrupt",
				erroredFileStream,
				{
					filename: "corrupt.txt",
					encoding: "7bit",
					mimeType: "text/plain",
				},
			);

			process.nextTick(() => {
				erroredFileStream.emit("error", new Error("Simulated file read failure"));
			});

			await expect(parsePromise).rejects.toThrow(BadRequestError);
			expect(fs.promises.unlink).toHaveBeenCalled();
		});
	});

	describe("Limits & Abort Conditions", () => {
		it("should reject when fileStream emits limit in memory mode", async () => {
			const { stream, headers } = createMultipartPayload(
				[],
				[
					{
						name: "largeFile",
						filename: "large.bin",
						contentType: "application/octet-stream",
						content: Buffer.alloc(100),
					},
				],
			);

			await expect(
				parseMultipart(stream, headers, {
					storage: "memory",
					limits: { fileSize: 10 },
				}),
			).rejects.toThrow(PayloadTooLargeError);
		});

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
			const headers = { "content-type": "multipart/form-data; boundary=----Aborted" };
			const promise = parseMultipart(stream, headers, { storage: "memory" });

			stream.emit("aborted");
			await expect(promise).rejects.toThrow("Client aborted the upload");

			const stream2 = new PassThrough();
			const promise2 = parseMultipart(stream2, headers, { storage: "memory" });
			stream2.emit("error", new Error("Socket reset"));
			await expect(promise2).rejects.toThrow("Request stream error: Socket reset");
		});

		it("should reject when busboy reaches partsLimit, filesLimit, or fieldsLimit", async () => {
			const runLimitTest = async (
				event: "partsLimit" | "filesLimit" | "fieldsLimit",
				expectedMessage: string,
			) => {
				const stream = new PassThrough();
				const headers = { "content-type": "multipart/form-data; boundary=----Limit" };
				const promise = parseMultipart(stream, headers, { storage: "memory" });

				setTimeout(() => {
					const pipes = (stream as unknown as { _readableState?: { pipes?: unknown } })
						?._readableState?.pipes;
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
			const headers = { "content-type": "multipart/form-data; boundary=----Err" };
			const promise = parseMultipart(stream, headers, { storage: "memory" });

			setTimeout(() => {
				const pipes = (stream as unknown as { _readableState?: { pipes?: unknown } })
					?._readableState?.pipes;
				const bbInstance = Array.isArray(pipes) ? pipes[0] : pipes;
				if (bbInstance && typeof bbInstance.emit === "function") {
					bbInstance.emit("error", new Error("Malformed boundary header"));
				}
			}, 10);

			await expect(promise).rejects.toThrow("Multipart parsing error: Malformed boundary header");
		});
	});
});