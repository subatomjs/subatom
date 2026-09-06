import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { single, array, fields, anyFiles, none } from "../../../packages/pipelines/files/fileUploadPipeline.js";
import * as parseMultipartModule from "../../../packages/pipelines/files/parseMultipart.js";
import {
	BadRequestError,
	PayloadTooLargeError,
	UnprocessableEntityError,
} from "../../../packages/errors/Errors.js";
import { FileUpload } from "../../../packages/pipelines/files/FileUpload.js";
import type { IFrameworkRequest } from "../../../packages/pipelines/files/types/files.types.js";

function createMockRequest(options: {
	headers?: Record<string, string | string[]>;
	body?: Record<string, unknown>;
	stream?: Readable;
	useGetters?: boolean;
	useRaw?: boolean;
}): IFrameworkRequest {
	const stream = options.stream ?? new Readable({ read() {} });
	const headers = options.headers ?? { "content-type": "multipart/form-data; boundary=abc" };

	if (options.useGetters) {
		return {
			getStream: () => stream,
			getHeaders: () => headers,
			headers,
			body: options.body,
		};
	}

	if (options.useRaw) {
		return {
			raw: stream,
			headers,
			body: options.body,
		};
	}

	const req = stream as unknown as IFrameworkRequest;
	req.headers = headers;
	req.body = options.body;
	return req;
}

interface TestResponseHelper {
	statusCode?: number;
	sentJson?: unknown;
	endedWith?: unknown;
	headersSent: boolean;
	status?: (code: number) => { json: (data: unknown) => void };
	json?: (data: unknown) => void;
	writeHead?: (code: number, headers?: Record<string, string>) => unknown;
	end?: (chunk?: unknown) => unknown;
	raw?: unknown;
	rawResponse?: unknown;
}

function createMockResponse(type: "raw" | "rawResponse" | "framework" | "native" | "headersSent" = "native") {
	const helper: TestResponseHelper = {
		headersSent: type === "headersSent",
	};

	if (type === "framework") {
		const jsonFn = vi.fn((data: unknown) => {
			helper.sentJson = data;
		});
		helper.status = vi.fn((code: number) => {
			helper.statusCode = code;
			return { json: jsonFn };
		});
		helper.json = jsonFn;
	} else if (type === "raw") {
		helper.raw = {
			headersSent: false,
			writeHead: vi.fn((code: number) => {
				helper.statusCode = code;
			}),
			end: vi.fn((chunk: unknown) => {
				helper.endedWith = chunk;
			}),
		};
	} else if (type === "rawResponse") {
		helper.rawResponse = {
			headersSent: false,
			writeHead: vi.fn((code: number) => {
				helper.statusCode = code;
			}),
			end: vi.fn((chunk: unknown) => {
				helper.endedWith = chunk;
			}),
		};
	} else {
		helper.writeHead = vi.fn((code: number) => {
			helper.statusCode = code;
			return helper;
		});
		helper.end = vi.fn((chunk: unknown) => {
			helper.endedWith = chunk;
		});
	}

	return helper as unknown as ServerResponse & TestResponseHelper;
}

describe("fileUploadPipeline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Request Header & Stream Inspection", () => {
		it("should bypass parsing and call next() immediately if request is not multipart", async () => {
			const req = createMockRequest({ headers: { "content-type": "application/json" } });
			const res = createMockResponse();
			const next = vi.fn();
			const spy = vi.spyOn(parseMultipartModule, "parseMultipart");

			const middleware = single("avatar");
			await middleware(req, res, next);

			expect(spy).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledWith();
		});

		it("should inspect getStream() and getHeaders() when available", async () => {
			const req = createMockRequest({
				useGetters: true,
				headers: { "content-type": ["multipart/form-data; boundary=123"] },
			});
			const res = createMockResponse();
			const next = vi.fn();

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: { user: "alice" },
				files: {},
			});

			const middleware = single("avatar");
			await middleware(req, res, next);

			expect(req.body).toEqual({ user: "alice" });
			expect(next).toHaveBeenCalledWith();
		});

		it("should inspect raw property when stream wrapper is present", async () => {
			const req = createMockRequest({
				useRaw: true,
				headers: { "content-type": "multipart/form-data; boundary=123" },
			});
			const res = createMockResponse();
			const next = vi.fn();

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: {},
			});

			const middleware = anyFiles();
			await middleware(req, res, next);
			expect(next).toHaveBeenCalledWith();
		});
	});

	describe("single() Middleware", () => {
		it("should attach file and files to request when target field is present", async () => {
			const dummyFile = new FileUpload({
				filename: "photo.jpg",
				encoding: "7bit",
				mimetype: "image/jpeg",
				storageType: "memory",
			});

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: { title: "Profile" },
				files: { photo: [dummyFile] },
			});

			const req = createMockRequest({ body: { existing: true } });
			const res = createMockResponse();
			const next = vi.fn();

			const middleware = single("photo");
			expect(middleware._fileConfig?.type).toBe("single");
			expect(middleware._fileConfig?.fieldname).toBe("photo");

			await middleware(req, res, next);

			expect(req.body).toEqual({ existing: true, title: "Profile" });
			expect(req.file).toBe(dummyFile);
			expect(req.files).toEqual({ photo: [dummyFile] });
			expect(next).toHaveBeenCalledWith();
		});

		it("should proceed without assigning req.file if target field has no uploaded files", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: {},
			});

			const req = createMockRequest({});
			const res = createMockResponse();
			const next = vi.fn();

			await single("avatar")(req, res, next);

			expect(req.file).toBeUndefined();
			expect(next).toHaveBeenCalledWith();
		});
	});

	describe("array() Middleware", () => {
		it("should attach array of files and first file to req.file", async () => {
			const file1 = new FileUpload({
				filename: "1.png",
				encoding: "7bit",
				mimetype: "image/png",
				storageType: "memory",
			});
			const file2 = new FileUpload({
				filename: "2.png",
				encoding: "7bit",
				mimetype: "image/png",
				storageType: "memory",
			});

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: { photos: [file1, file2] },
			});

			const req = createMockRequest({});
			const res = createMockResponse();
			const next = vi.fn();

			const middleware = array("photos", 5);
			expect(middleware._fileConfig?.type).toBe("array");
			expect(middleware._fileConfig?.maxCount).toBe(5);

			await middleware(req, res, next);

			expect(req.files).toEqual([file1, file2]);
			expect(req.file).toBe(file1);
			expect(next).toHaveBeenCalledWith();
		});

		it("should cleanup files and send 413 error if file count exceeds maxCount", async () => {
			const file1 = new FileUpload({
				filename: "1.png",
				encoding: "7bit",
				mimetype: "image/png",
				storageType: "memory",
			});
			const file2 = new FileUpload({
				filename: "2.png",
				encoding: "7bit",
				mimetype: "image/png",
				storageType: "memory",
			});
			const destroySpy1 = vi.spyOn(file1, "destroy");
			const destroySpy2 = vi.spyOn(file2, "destroy");

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: { photos: [file1, file2] },
			});

			const req = createMockRequest({});
			const res = createMockResponse("native");
			const next = vi.fn();

			await array("photos", 1)(req, res, next);

			expect(destroySpy1).toHaveBeenCalled();
			expect(destroySpy2).toHaveBeenCalled();
			expect(res.statusCode).toBe(413);
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("fields() Middleware", () => {
		it("should match configured fields and assign keyed dictionary", async () => {
			const avatar = new FileUpload({
				filename: "avatar.png",
				encoding: "7bit",
				mimetype: "image/png",
				storageType: "memory",
			});
			const doc = new FileUpload({
				filename: "cv.pdf",
				encoding: "7bit",
				mimetype: "application/pdf",
				storageType: "memory",
			});

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: { avatar: [avatar], cv: [doc] },
			});

			const req = createMockRequest({});
			const res = createMockResponse();
			const next = vi.fn();

			const middleware = fields([
				{ name: "avatar", maxCount: 1 },
				{ name: "cv", maxCount: 2 },
			]);
			expect(middleware._fileConfig?.type).toBe("fields");

			await middleware(req, res, next);

			expect(req.files).toEqual({
				avatar: [avatar],
				cv: [doc],
			});
			expect(next).toHaveBeenCalledWith();
		});

		it("should cleanup and write 413 if any specific field exceeds maxCount", async () => {
			const file1 = new FileUpload({
				filename: "1.png",
				encoding: "7bit",
				mimetype: "image/png",
				storageType: "memory",
			});
			const file2 = new FileUpload({
				filename: "2.png",
				encoding: "7bit",
				mimetype: "image/png",
				storageType: "memory",
			});
			const destroySpy = vi.spyOn(file1, "destroy");

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: { avatar: [file1, file2] },
			});

			const req = createMockRequest({});
			const res = createMockResponse("framework");
			const next = vi.fn();

			await fields([{ name: "avatar", maxCount: 1 }])(req, res, next);

			expect(destroySpy).toHaveBeenCalled();
			expect(res.statusCode).toBe(413);
			expect(res.sentJson).toEqual({
				error: "Exceeded maximum file count (1) for field 'avatar'",
			});
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("anyFiles() Middleware", () => {
		it("should assign all files map directly to req.files", async () => {
			const file = new FileUpload({
				filename: "any.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
			});

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: { data: "test" },
				files: { misc: [file] },
			});

			const req = createMockRequest({});
			const res = createMockResponse();
			const next = vi.fn();

			const middleware = anyFiles();
			expect(middleware._fileConfig?.type).toBe("any");

			await middleware(req, res, next);

			expect(req.body).toEqual({ data: "test" });
			expect(req.files).toEqual({ misc: [file] });
			expect(next).toHaveBeenCalledWith();
		});
	});

	describe("none() Middleware", () => {
		it("should pass through when only text fields are submitted", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: { username: "bob" },
				files: {},
			});

			const req = createMockRequest({});
			const res = createMockResponse();
			const next = vi.fn();

			const middleware = none();
			expect(middleware._fileConfig?.type).toBe("none");

			await middleware(req, res, next);

			expect(req.body).toEqual({ username: "bob" });
			expect(next).toHaveBeenCalledWith();
		});

		it("should clean up files and reject with 400 if files are included", async () => {
			const unwanted = new FileUpload({
				filename: "prohibited.exe",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "memory",
			});
			const destroySpy = vi.spyOn(unwanted, "destroy");

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: { prohibited: [unwanted] },
			});

			const req = createMockRequest({});
			const res = createMockResponse("native");
			const next = vi.fn();

			await none()(req, res, next);

			expect(destroySpy).toHaveBeenCalled();
			expect(res.statusCode).toBe(400);
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("sendUploadError handling & response variations", () => {
		it("should route status code 422 for UnprocessableEntityError", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				new UnprocessableEntityError("Invalid file type"),
			);

			const req = createMockRequest({});
			const res = createMockResponse("native");
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.statusCode).toBe(422);
			expect(res.endedWith).toBe(JSON.stringify({ error: "Invalid file type" }));
			expect(next).not.toHaveBeenCalled();
		});

		it("should write to res.rawResponse when available", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				new BadRequestError("Bad syntax"),
			);

			const req = createMockRequest({});
			const res = createMockResponse("rawResponse");
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.statusCode).toBe(400);
			expect(next).not.toHaveBeenCalled();
		});

		it("should write to res.raw when available", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				new BadRequestError("Bad syntax"),
			);

			const req = createMockRequest({});
			const res = createMockResponse("raw");
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.statusCode).toBe(400);
			expect(next).not.toHaveBeenCalled();
		});

		it("should delegate to next(err) if headers are already sent", async () => {
			const error = new BadRequestError("Premature failure");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(error);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.writeHead).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledWith(error);
		});

		it("should normalize non-Error throwables to standard Error in next()", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce("String failure");

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe("String failure");
		});
	});
});