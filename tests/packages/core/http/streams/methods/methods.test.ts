import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough, Readable } from "node:stream";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPassThrough } from "../../../../../../packages/core/http/streams/methods/composition/passThrough.js";
import { pipe } from "../../../../../../packages/core/http/streams/methods/composition/pipe.js";
import { pipeline } from "../../../../../../packages/core/http/streams/methods/composition/pipeline.js";
import { createTransform } from "../../../../../../packages/core/http/streams/methods/composition/transform.js";
import { fileStream } from "../../../../../../packages/core/http/streams/methods/files/fileStream.js";
import { resDownload } from "../../../../../../packages/core/http/streams/methods/files/resDownload.js";
import { resSendFile } from "../../../../../../packages/core/http/streams/methods/files/resSendFile.js";
import { reqOnData } from "../../../../../../packages/core/http/streams/methods/request/reqOnData.js";
import { reqOnEnd } from "../../../../../../packages/core/http/streams/methods/request/reqOnEnd.js";
import { reqPipe } from "../../../../../../packages/core/http/streams/methods/request/reqPipe.js";
import { reqStream } from "../../../../../../packages/core/http/streams/methods/request/reqStream.js";
import { resEnd } from "../../../../../../packages/core/http/streams/methods/response/resEnd.js";
import { resSendStream } from "../../../../../../packages/core/http/streams/methods/response/resSendStream.js";
import { resStream } from "../../../../../../packages/core/http/streams/methods/response/resStream.js";
import { resWrite } from "../../../../../../packages/core/http/streams/methods/response/resWrite.js";

const { mockCreateReadStream, mockStat } = vi.hoisted(() => ({
	mockCreateReadStream: vi.fn(),
	mockStat: vi.fn(),
}));

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return {
		...actual,
		createReadStream: mockCreateReadStream,
		stat: mockStat,
		default: {
			...actual,
			createReadStream: mockCreateReadStream,
			stat: mockStat,
		},
	};
});

interface MockServerResponseFixture {
	raw: ServerResponse;
	state: {
		writableEnded: boolean;
		writableFinished: boolean;
		headersSent: boolean;
		destroyedWith?: Error;
	};
}

function createMockServerResponse(): MockServerResponseFixture {
	const state = {
		writableEnded: false,
		writableFinished: false,
		headersSent: false,
		destroyedWith: undefined as Error | undefined,
	};

	const pt = new PassThrough();
	const raw = Object.assign(pt, {
		statusCode: 200,
		setHeader: vi.fn(),
		removeHeader: vi.fn(),
	}) as unknown as ServerResponse;

	const originalWrite = pt.write.bind(pt);
	const originalEnd = pt.end.bind(pt);
	const originalDestroy = pt.destroy.bind(pt);

	raw.write = vi.fn((chunk: unknown, enc?: unknown, cb?: unknown) => {
		return originalWrite(chunk as never, enc as never, cb as never);
	}) as never;

	raw.end = vi.fn((chunk?: unknown, enc?: unknown, cb?: unknown) => {
		state.writableEnded = true;
		state.writableFinished = true;
		return originalEnd(chunk as never, enc as never, cb as never);
	}) as never;

	raw.destroy = vi.fn((err?: Error) => {
		state.destroyedWith = err;
		originalDestroy(err);
		return raw;
	});

	Object.defineProperty(raw, "writableEnded", {
		get: () => state.writableEnded,
		configurable: true,
	});

	Object.defineProperty(raw, "writableFinished", {
		get: () => state.writableFinished,
		configurable: true,
	});

	Object.defineProperty(raw, "headersSent", {
		get: () => state.headersSent,
		configurable: true,
	});

	return { raw, state };
}

describe("Stream Methods", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Composition & Helpers", () => {
		it("should instantiate PassThrough streams via createPassThrough", () => {
			const pt = createPassThrough();
			expect(pt).toBeInstanceOf(PassThrough);
		});

		it("should pipe source to destination via pipe()", () => {
			const source = new PassThrough();
			const dest = new PassThrough();
			expect(pipe(source, dest)).toBe(dest);
		});

		it("should complete successfully when pipeline receives 2 or more streams", async () => {
			const source = Readable.from(["hello", "world"]);
			const destination = new PassThrough();

			await expect(pipeline(source, destination)).resolves.toBeUndefined();
		});

		it("should reject pipeline() if fewer than 2 streams are supplied", async () => {
			const s = new PassThrough();
			await expect(
				pipeline(
					...([s] as unknown as [NodeJS.ReadableStream, NodeJS.WritableStream]),
				),
			).rejects.toThrow("Pipeline requires at least 2 stream parameters");
		});

		it("should catch sync exceptions in createTransform and route to callback", async () => {
			const transform = createTransform(() => {
				throw new Error("Transform fault");
			});

			await expect(
				new Promise((_, reject) => {
					transform.on("error", reject);
					transform.write("data");
				}),
			).rejects.toThrow("Transform fault");
		});

		it("should catch non-Error thrown exceptions in createTransform and wrap them in an Error", async () => {
			const transform = createTransform(() => {
				throw "String error";
			});

			await expect(
				new Promise((_, reject) => {
					transform.on("error", reject);
					transform.write("data");
				}),
			).rejects.toThrow("String error");
		});
	});

	describe("File Methods", () => {
		it("should create readable file streams via fileStream()", () => {
			mockCreateReadStream.mockReturnValue(new PassThrough());
			const s = fileStream("/path/to/asset.txt");
			expect(mockCreateReadStream).toHaveBeenCalledWith(
				"/path/to/asset.txt",
				undefined,
			);
			expect(s).toBeDefined();
		});

		it("should throw an error in resSendFile if headers have already been sent", () => {
			const { raw, state } = createMockServerResponse();
			state.headersSent = true;

			expect(() => resSendFile(raw, "file.txt")).toThrow(
				"[Subatom File Error]: Headers already sent.",
			);
		});

		it("should prevent directory traversal in resSendFile with 403", () => {
			const { raw } = createMockServerResponse();

			resSendFile(raw, "../../etc/passwd", { root: "/var/www" });
			expect(raw.statusCode).toBe(403);
			expect(raw.end).toHaveBeenCalledWith(
				expect.stringContaining("Path traversal restriction"),
			);
		});

		it("should set 404 in resSendFile when path points to a non-file", () => {
			const { raw } = createMockServerResponse();

			mockStat.mockImplementation(
				(
					_p: string,
					cb: (err: null, stats: { isFile: () => boolean }) => void,
				) => {
					cb(null, { isFile: () => false });
				},
			);

			resSendFile(raw, "directory", { root: "/var/www" });
			expect(raw.statusCode).toBe(404);
			expect(raw.end).toHaveBeenCalledWith("File Not Found");
		});

		it("should set 404 in resSendFile when file does not exist", () => {
			const { raw } = createMockServerResponse();

			mockStat.mockImplementation(
				(_p: string, cb: (err: Error | null, stats: unknown) => void) => {
					cb(new Error("ENOENT"), null);
				},
			);

			resSendFile(raw, "file.txt", { root: "/var/www" });
			expect(raw.statusCode).toBe(404);
			expect(raw.end).toHaveBeenCalledWith("File Not Found");
		});

		it("should pipe file stream and set Content-Type header on success in resSendFile without root", () => {
			const { raw } = createMockServerResponse();
			const fakeStream = new PassThrough();
			mockCreateReadStream.mockReturnValue(fakeStream);

			mockStat.mockImplementation(
				(
					_p: string,
					cb: (
						err: null,
						stats: { isFile: () => boolean; size: number },
					) => void,
				) => {
					cb(null, { isFile: () => true, size: 256 });
				},
			);

			resSendFile(raw, "public/file.png", { contentType: "image/png" });

			expect(raw.statusCode).toBe(200);
			expect(raw.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
			expect(raw.setHeader).toHaveBeenCalledWith("Content-Length", "256");
		});

		it("should handle file stream error in resSendFile when headers have not been sent", () => {
			const { raw, state } = createMockServerResponse();
			const fakeStream = new PassThrough();
			mockCreateReadStream.mockReturnValue(fakeStream);

			mockStat.mockImplementation(
				(
					_p: string,
					cb: (
						err: null,
						stats: { isFile: () => boolean; size: number },
					) => void,
				) => {
					cb(null, { isFile: () => true, size: 128 });
				},
			);

			resSendFile(raw, "doc.txt");
			state.headersSent = false;
			fakeStream.emit("error", new Error("Disk Read Error"));

			expect(raw.statusCode).toBe(500);
			expect(raw.end).toHaveBeenCalledWith("Failed to read file.");
		});

		it("should destroy response with error in resSendFile when headers were already sent", () => {
			const { raw, state } = createMockServerResponse();
			raw.on("error", () => {}); // Catch the error event emitted on destroy

			const fakeStream = new PassThrough();
			mockCreateReadStream.mockReturnValue(fakeStream);

			mockStat.mockImplementation(
				(
					_p: string,
					cb: (
						err: null,
						stats: { isFile: () => boolean; size: number },
					) => void,
				) => {
					cb(null, { isFile: () => true, size: 128 });
				},
			);

			resSendFile(raw, "doc.txt");
			state.headersSent = true;
			const streamErr = new Error("Mid-stream disk failure");
			fakeStream.emit("error", streamErr);

			expect(raw.destroy).toHaveBeenCalledWith(streamErr);
		});

		it("should configure Content-Disposition attachment header in resDownload with explicit filename", () => {
			const { raw } = createMockServerResponse();

			mockStat.mockImplementation(
				(
					_p: string,
					cb: (
						err: null,
						stats: { isFile: () => boolean; size: number },
					) => void,
				) => {
					cb(null, {
						isFile: () => true,
						size: 100,
					});
				},
			);

			resDownload(raw, "/data/report.pdf", "my-report.pdf");
			expect(raw.setHeader).toHaveBeenCalledWith(
				"Content-Disposition",
				expect.stringContaining('attachment; filename="my-report.pdf"'),
			);
		});

		it("should default to basename when filename is omitted in resDownload", () => {
			const { raw } = createMockServerResponse();

			mockStat.mockImplementation(
				(
					_p: string,
					cb: (
						err: null,
						stats: { isFile: () => boolean; size: number },
					) => void,
				) => {
					cb(null, {
						isFile: () => true,
						size: 100,
					});
				},
			);

			resDownload(raw, "/data/auto-named-report.pdf");
			expect(raw.setHeader).toHaveBeenCalledWith(
				"Content-Disposition",
				expect.stringContaining('attachment; filename="auto-named-report.pdf"'),
			);
		});
	});

	describe("Request Methods", () => {
		it("should subscribe and unsubscribe data and end listeners", () => {
			const req = new PassThrough() as unknown as IncomingMessage;
			const dataSpy = vi.fn();
			const endSpy = vi.fn();

			const unData = reqOnData(req, dataSpy);
			const unEnd = reqOnEnd(req, endSpy);

			req.emit("data", "chunk");
			expect(dataSpy).toHaveBeenCalledWith(Buffer.from("chunk"));

			const bufferChunk = Buffer.from("already-buffer");
			req.emit("data", bufferChunk);
			expect(dataSpy).toHaveBeenCalledWith(bufferChunk);

			req.emit("end");
			expect(endSpy).toHaveBeenCalled();

			unData();
			unEnd();
			expect(req.listenerCount("data")).toBe(0);
			expect(req.listenerCount("end")).toBe(0);
		});

		it("should pipe successfully when request is active", () => {
			const req = new PassThrough() as unknown as IncomingMessage;
			const dest = new PassThrough();

			expect(reqPipe(req, dest)).toBe(dest);
		});

		it("should return the readable request stream when not destroyed", () => {
			const req = new PassThrough() as unknown as IncomingMessage;
			expect(reqStream(req)).toBe(req);
		});

		it("should throw in reqPipe and reqStream if request is already destroyed", () => {
			const req = { destroyed: true } as IncomingMessage;
			const dest = new PassThrough();

			expect(() => reqPipe(req, dest)).toThrow(
				"Cannot pipe a destroyed request",
			);
			expect(() => reqStream(req)).toThrow(
				"Request stream has already been destroyed",
			);
		});
	});

	describe("Response Methods", () => {
		let raw: ServerResponse;
		let state: MockServerResponseFixture["state"];

		beforeEach(() => {
			const fixture = createMockServerResponse();
			raw = fixture.raw;
			state = fixture.state;
		});

		it("should normalize callback shifts in resEnd when chunk is omitted", () => {
			const cb = vi.fn();
			resEnd(raw, undefined, undefined, cb);
			expect(raw.end).toHaveBeenCalledWith(undefined, "utf-8", cb);
		});

		it("should normalize callback shifts in resEnd with chunk and encoding", () => {
			const cbWithChunk = vi.fn();
			resEnd(raw, "chunk", "utf-8", cbWithChunk as () => void);
			expect(raw.end).toHaveBeenCalledWith("chunk", "utf-8", cbWithChunk);
		});

		it("should guard writes in resWrite if stream is closed", () => {
			state.writableEnded = true;
			const cb = vi.fn();

			const written = resWrite(raw, "data", undefined, cb);
			expect(written).toBe(false);
			expect(cb).toHaveBeenCalledWith(expect.any(Error));

			const writtenNoCb = resWrite(raw, "data");
			expect(writtenNoCb).toBe(false);
		});

		it("should support encoding callback overload and write to open response in resWrite", () => {
			const cb = vi.fn();
			const writeResult = resWrite(
				raw,
				"test-data",
				cb as unknown as BufferEncoding,
			);

			expect(writeResult).toBe(true);
			expect(raw.write).toHaveBeenCalledWith("test-data", "utf-8", cb);
		});

		it("should set headers and pipe in resSendStream", () => {
			const readable = new PassThrough();
			resSendStream(raw, readable, {
				statusCode: 201,
				contentType: "text/plain",
				contentLength: 50,
			});

			expect(raw.statusCode).toBe(201);
			expect(raw.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain");
			expect(raw.setHeader).toHaveBeenCalledWith("Content-Length", "50");
		});

		it("should pipe safely and handle errors in resStream", async () => {
			const readable = Readable.from(["chunk-1"]);
			await resStream(raw, readable);
			expect(state.writableEnded).toBe(true);
		});
	});
});
