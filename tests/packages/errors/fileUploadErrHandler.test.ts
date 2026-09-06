import { describe, test, expect, vi } from "vitest";
import { fileUploadErrorHandler } from "../../../packages/errors/fileUploadErrHandler.js";
import {
	BadRequestError,
	PayloadTooLargeError,
	UnprocessableEntityError,
} from "../../../packages/errors/Errors.js";
import type {
	IFrameworkRequest,
	ErrorHandlerResponse,
} from "../../../packages/pipelines/files/types/files.types.js";
import type { NextFunction } from "../../../packages/pipelines/next/types/nextFunction.types.js";

describe("fileUploadErrorHandler", () => {
	const mockReq = {} as IFrameworkRequest;

	test("calls next() without error if err is null or undefined", () => {
		const next = vi.fn() as NextFunction;
		const res = {} as ErrorHandlerResponse;

		fileUploadErrorHandler(null, mockReq, res, next);
		expect(next).toHaveBeenCalledTimes(1);
		expect(next).toHaveBeenCalledWith();

		fileUploadErrorHandler(undefined, mockReq, res, next);
		expect(next).toHaveBeenCalledTimes(2);
	});

	describe("Wrapped Response Pattern (res.raw or res.rawResponse)", () => {
		test("writes status 413 for PayloadTooLargeError to res.raw", () => {
			const writeHead = vi.fn();
			const end = vi.fn();
			const raw = {
				headersSent: false,
				writeHead,
				end,
			};
			const res = { raw } as unknown as ErrorHandlerResponse;
			const next = vi.fn();
			const err = new PayloadTooLargeError("File exceeds 5MB");

			fileUploadErrorHandler(err, mockReq, res, next);

			expect(writeHead).toHaveBeenCalledWith(413, {
				"Content-Type": "application/json",
			});
			expect(end).toHaveBeenCalledWith(
				JSON.stringify({ error: "File exceeds 5MB" }),
			);
			expect(next).not.toHaveBeenCalled();
		});

		test("writes status 422 for UnprocessableEntityError to res.rawResponse", () => {
			const writeHead = vi.fn();
			const end = vi.fn();
			const rawResponse = {
				headersSent: false,
				writeHead,
				end,
			};
			const res = { rawResponse } as unknown as ErrorHandlerResponse;
			const next = vi.fn();
			const err = new UnprocessableEntityError("Unsupported file extension");

			fileUploadErrorHandler(err, mockReq, res, next);

			expect(writeHead).toHaveBeenCalledWith(422, {
				"Content-Type": "application/json",
			});
			expect(end).toHaveBeenCalledWith(
				JSON.stringify({ error: "Unsupported file extension" }),
			);
		});

		test("skips writing if raw response headers are already sent", () => {
			const writeHead = vi.fn();
			const end = vi.fn();
			const raw = {
				headersSent: true,
				writeHead,
				end,
			};
			const res = { raw } as unknown as ErrorHandlerResponse;
			const next = vi.fn();

			fileUploadErrorHandler(new Error("Generic"), mockReq, res, next);

			expect(writeHead).not.toHaveBeenCalled();
			expect(end).not.toHaveBeenCalled();
		});
	});

	describe("Express-like Chaining Pattern (res.status().json())", () => {
		test("formats BadRequestError with status 400", () => {
			const json = vi.fn();
			const status = vi.fn().mockReturnValue({ json });
			const res = { status } as unknown as ErrorHandlerResponse;
			const next = vi.fn();
			const err = new BadRequestError("Multipart boundary missing");

			fileUploadErrorHandler(err, mockReq, res, next);

			expect(status).toHaveBeenCalledWith(400);
			expect(json).toHaveBeenCalledWith({
				error: "Multipart boundary missing",
			});
		});

		test("falls back to 500 status and default message for untyped errors", () => {
			const json = vi.fn();
			const status = vi.fn().mockReturnValue({ json });
			const res = { status } as unknown as ErrorHandlerResponse;
			const next = vi.fn();

			fileUploadErrorHandler({}, mockReq, res, next);

			expect(status).toHaveBeenCalledWith(500);
			expect(json).toHaveBeenCalledWith({ error: "Internal server error" });
		});
	});

	describe("Raw Node.js ServerResponse Pattern", () => {
		test("writes status code and ends the response directly", () => {
			const writeHead = vi.fn();
			const end = vi.fn();
			const res = {
				headersSent: false,
				writeHead,
				end,
			} as unknown as ErrorHandlerResponse;
			const next = vi.fn();
			const err = new Error("Disk full");

			fileUploadErrorHandler(err, mockReq, res, next);

			expect(writeHead).toHaveBeenCalledWith(500, {
				"Content-Type": "application/json",
			});
			expect(end).toHaveBeenCalledWith(JSON.stringify({ error: "Disk full" }));
		});

		test("does not attempt writeHead when headersSent is true", () => {
			const writeHead = vi.fn();
			const end = vi.fn();
			const res = {
				headersSent: true,
				writeHead,
				end,
			} as unknown as ErrorHandlerResponse;
			const next = vi.fn();

			fileUploadErrorHandler(new Error("Late error"), mockReq, res, next);

			expect(writeHead).not.toHaveBeenCalled();
			expect(end).not.toHaveBeenCalled();
		});

		test("handles response without an end method safely", () => {
			const writeHead = vi.fn();
			const res = {
				headersSent: false,
				writeHead,
			} as unknown as ErrorHandlerResponse;
			const next = vi.fn();

			fileUploadErrorHandler(new Error("No end method"), mockReq, res, next);

			expect(writeHead).toHaveBeenCalledWith(500, {
				"Content-Type": "application/json",
			});
		});
	});

	describe("Terminal Fallback", () => {
		test("rethrows the error if response object matches no supported interface", () => {
			const invalidRes = { customSink: true } as unknown as ErrorHandlerResponse;
			const next = vi.fn();
			const originalErr = new Error("Unresolvable response sink");

			expect(() => {
				fileUploadErrorHandler(originalErr, mockReq, invalidRes, next);
			}).toThrow(originalErr);
		});
	});
});