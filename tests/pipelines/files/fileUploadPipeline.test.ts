/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import {
	single,
	array,
	fields,
	anyFiles,
	none,
} from "../../../packages/pipelines/files/fileUploadPipeline.js";
import * as parseMultipartModule from "../../../packages/pipelines/files/parseMultipart.js";
import {
	SubatomError,
	NotFoundError,
	BadRequestError,
	MethodNotAllowedError,
	PayloadTooLargeError,
	UnprocessableEntityError,
	FileFilterError,
	normalizeError,
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
	const headers = options.headers ?? {
		"content-type": "multipart/form-data; boundary=abc",
	};

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

function createMockResponse(
	type:
		| "raw"
		| "rawResponse"
		| "framework"
		| "native"
		| "headersSent" = "native",
) {
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
			const req = createMockRequest({
				headers: { "content-type": "application/json" },
			});
			const res = createMockResponse();
			const next = vi.fn();
			const spy = vi.spyOn(parseMultipartModule, "parseMultipart");

			const middleware = single("avatar");
			await middleware(req, res, next);

			expect(spy).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledWith();
		});

		it("should handle missing headers object safely", async () => {
			const stream = new Readable({ read() {} });
			const req = stream as unknown as IFrameworkRequest;
			delete (req as unknown as Record<string, unknown>).headers;
			const res = createMockResponse();
			const next = vi.fn();

			const middleware = single("avatar");
			await middleware(req, res, next);

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

		it("should bypass all upload middleware when the request is not multipart", async () => {
			const req = createMockRequest({
				headers: { "content-type": "application/json" },
			});
			const res = createMockResponse();

			const singleNext = vi.fn();
			await single("file")(req, res, singleNext);
			expect(singleNext).toHaveBeenCalledWith();

			const arrayNext = vi.fn();
			await array("files")(req, res, arrayNext);
			expect(arrayNext).toHaveBeenCalledWith();

			const anyNext = vi.fn();
			await anyFiles()(req, res, anyNext);
			expect(anyNext).toHaveBeenCalledWith();

			const noneNext = vi.fn();
			await none()(req, res, noneNext);
			expect(noneNext).toHaveBeenCalledWith();
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

		it("should fall back to next(err) with Error instance when Error is thrown (line 186)", async () => {
			const err = new Error("Custom error");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				err,
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await single("avatar")(req, res, next);

			expect(next).toHaveBeenCalledWith(err);
		});

		it("should fall back to next(err) with new Error(String(err)) when non-Error is thrown (line 186)", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				"String error single",
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await single("avatar")(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe("String error single");
		});
	});

	describe("array() Middleware", () => {
		it("should bypass parsing when the array request is not multipart", async () => {
			const req = createMockRequest({
				headers: { "content-type": "application/json" },
			});
			const next = vi.fn();

			await array("photos")(req, createMockResponse(), next);

			expect(next).toHaveBeenCalledWith();
		});

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

		it("should handle empty matched files without assigning req.file", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: {},
			});

			const req = createMockRequest({});
			const res = createMockResponse();
			const next = vi.fn();

			await array("photos")(req, res, next);

			expect(req.files).toEqual([]);
			expect(req.file).toBeUndefined();
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

		it("should pass error to next() when maxCount exceeded and headersSent is true", async () => {
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
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await array("photos", 1)(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(PayloadTooLargeError));
		});

		it("should fall back to next(err) if parsing fails with non-Error", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				"Array primitive error",
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await array("photos")(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe("Array primitive error");
		});

		it("should fall back to next(err) if parsing fails with Error instance", async () => {
			const err = new Error("Array Error instance");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				err,
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await array("photos")(req, res, next);

			expect(next).toHaveBeenCalledWith(err);
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

		it("should safely skip undefined elements in sparse fieldsConfig", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: {},
			});

			const req = createMockRequest({});
			const res = createMockResponse();
			const next = vi.fn();

			const sparseConfig = [
				undefined as unknown as { name: string; maxCount?: number },
			];
			await fields(sparseConfig)(req, res, next);

			expect(req.files).toEqual({});
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

		it("should delegate to next(err) if field maxCount exceeded and headersSent is true", async () => {
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
				files: { avatar: [file1, file2] },
			});

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await fields([{ name: "avatar", maxCount: 1 }])(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(PayloadTooLargeError));
		});

		it("should delegate to next(err) with Error instance when fields parsing fails (line 242)", async () => {
			const err = new Error("Fields Error instance");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				err,
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await fields([{ name: "avatar" }])(req, res, next);

			expect(next).toHaveBeenCalledWith(err);
		});

		it("should delegate to next(err) with new Error(String(err)) when fields parsing fails with non-Error (line 242)", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				"Fields primitive error",
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await fields([{ name: "avatar" }])(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe("Fields primitive error");
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

		it("should delegate to next(err) with Error instance when anyFiles throws Error (line 300)", async () => {
			const err = new Error("AnyFiles Error instance");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				err,
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await anyFiles()(req, res, next);

			expect(next).toHaveBeenCalledWith(err);
		});

		it("should delegate to next(err) if anyFiles throws non-Error and headersSent is true (line 300)", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				"AnyFiles primitive error",
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await anyFiles()(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe("AnyFiles primitive error");
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

		it("should delegate to next(err) in none() when files uploaded and headersSent is true", async () => {
			const unwanted = new FileUpload({
				filename: "prohibited.exe",
				encoding: "binary",
				mimetype: "application/octet-stream",
				storageType: "memory",
			});

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: { prohibited: [unwanted] },
			});

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await none()(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
		});

		it("should delegate to next(err) with Error instance when none() throws Error (line 338)", async () => {
			const err = new Error("None Error instance");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				err,
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await none()(req, res, next);

			expect(next).toHaveBeenCalledWith(err);
		});

		it("should delegate to next(err) if none() throws non-Error and headersSent is true (line 338)", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				"None primitive error",
			);

			const req = createMockRequest({});
			const res = createMockResponse("headersSent");
			const next = vi.fn();

			await none()(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe("None primitive error");
		});
	});

	describe("sendUploadError handling & direct response variations (lines 78-84)", () => {
		it("should route status code 422 for UnprocessableEntityError", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				new UnprocessableEntityError("Invalid file type"),
			);

			const req = createMockRequest({});
			const res = createMockResponse("native");
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.statusCode).toBe(422);
			expect(res.endedWith).toBe(
				JSON.stringify({ error: "Invalid file type" }),
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("should route status code 500 for generic unhandled errors", async () => {
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				new Error("Internal DB failure"),
			);

			const req = createMockRequest({});
			const res = createMockResponse("native");
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.statusCode).toBe(500);
			expect(res.endedWith).toBe(
				JSON.stringify({ error: "Internal DB failure" }),
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("should reach fallback writeHead branch when raw has no writeHead (lines 78-84)", async () => {
			const res: any = {
				raw: {}, // rawRes is {}, so rawRes.writeHead is undefined, skipping block 1
				headersSent: false,
				writeHead: vi.fn(),
				end: vi.fn(),
			};

			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				new BadRequestError("Bare writeHead response error"),
			);

			const req = createMockRequest({});
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.writeHead).toHaveBeenCalledWith(400, {
				"Content-Type": "application/json",
			});
			expect(res.end).toHaveBeenCalledWith(
				JSON.stringify({ error: "Bare writeHead response error" }),
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("should return false on fallback writeHead branch when headersSent is true (lines 78-84)", async () => {
			const res: any = {
				raw: {}, // skips block 1
				headersSent: true,
				writeHead: vi.fn(),
				end: vi.fn(),
			};

			const err = new BadRequestError("Already sent bare writeHead");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				err,
			);

			const req = createMockRequest({});
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.writeHead).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledWith(err);
		});

		it("should reach fallback writeHead branch without res.end (lines 78-84)", async () => {
			const res: any = {
				raw: {}, // skips block 1
				headersSent: false,
				writeHead: vi.fn(),
				// end is intentionally omitted
			};

			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				new BadRequestError("No end method"),
			);

			const req = createMockRequest({});
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.writeHead).toHaveBeenCalledWith(400, {
				"Content-Type": "application/json",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("should return false on fallback writeHead branch when headersSent is true (lines 78-84)", async () => {
			const res: any = {
				raw: false,
				rawResponse: false,
				headersSent: true,
				writeHead: vi.fn(),
				end: vi.fn(),
			};

			const err = new BadRequestError("Already sent bare writeHead");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				err,
			);

			const req = createMockRequest({});
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(res.writeHead).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledWith(err);
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

		it("should catch errors thrown by res.writeHead and fall back to next(err)", async () => {
			const res: any = {
				writeHead: () => {
					throw new Error("Socket broken");
				},
			};

			const err = new BadRequestError("Trigger catch block");
			vi.spyOn(parseMultipartModule, "parseMultipart").mockRejectedValueOnce(
				err,
			);

			const req = createMockRequest({});
			const next = vi.fn();

			await single("file")(req, res, next);

			expect(next).toHaveBeenCalledWith(err);
		});

		it("should safely swallow destroy failures during cleanupFiles", async () => {
			const buggyFile = new FileUpload({
				filename: "bug.txt",
				encoding: "7bit",
				mimetype: "text/plain",
				storageType: "memory",
			});
			vi.spyOn(buggyFile, "destroy").mockRejectedValueOnce(
				new Error("Destroy error"),
			);

			vi.spyOn(parseMultipartModule, "parseMultipart").mockResolvedValueOnce({
				body: {},
				files: {
					list: [buggyFile, undefined as unknown as FileUpload],
					emptyList: undefined as unknown as FileUpload[],
				},
			});

			const req = createMockRequest({});
			const res = createMockResponse("native");
			const next = vi.fn();

			await none()(req, res, next);

			expect(res.statusCode).toBe(400);
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("Errors class validation (Ensures 100% coverage on Errors.ts)", () => {
		it("should verify SubatomError defaults and custom options", () => {
			const def = new SubatomError("Def");
			expect(def.statusCode).toBe(500);
			expect(def.errorCode).toBe("INTERNAL_SERVER_ERROR");
			expect(def.isOperational).toBe(true);

			const custom = new SubatomError("Custom", {
				statusCode: 503,
				errorCode: "UNAVAILABLE",
				isOperational: false,
				details: { d: 1 },
			});
			expect(custom.statusCode).toBe(503);
			expect(custom.errorCode).toBe("UNAVAILABLE");
			expect(custom.isOperational).toBe(false);
			expect(custom.details).toEqual({ d: 1 });
		});

		it("should verify NotFoundError default and custom message", () => {
			const def = new NotFoundError();
			expect(def.message).toBe("Resource Not Found");
			expect(def.statusCode).toBe(404);

			const custom = new NotFoundError("Not found here");
			expect(custom.message).toBe("Not found here");
		});

		it("should verify MethodNotAllowedError default and custom message", () => {
			const def = new MethodNotAllowedError();
			expect(def.message).toBe("Method Not Allowed");
			expect(def.statusCode).toBe(405);

			const custom = new MethodNotAllowedError("Custom 405");
			expect(custom.message).toBe("Custom 405");
		});

		it("should verify FileFilterError default and custom message", () => {
			const def = new FileFilterError();
			expect(def.name).toBe("FileFilterError");
			expect(def.message).toBe("File type not allowed");
			expect(def.statusCode).toBe(422);

			const custom = new FileFilterError("Disallowed ext");
			expect(custom.message).toBe("Disallowed ext");
		});

		it("should normalize all throwables with normalizeError", () => {
			const err = new Error("Native");
			expect(normalizeError(err)).toBe(err);

			const strErr = normalizeError("Str error");
			expect(strErr).toBeInstanceOf(SubatomError);
			expect(strErr.message).toBe("Str error");

			const objErr = normalizeError({ reason: "unknown" }) as SubatomError;
			expect(objErr).toBeInstanceOf(SubatomError);
			expect(objErr.details).toEqual({ reason: "unknown" });
		});
	});
});
