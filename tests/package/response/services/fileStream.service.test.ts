import { createReadStream } from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	handleStreamError,
	pipeFile,
	resolveSafePath,
} from "../../../../package/core/http/response/services/sendFile.service.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	const mockCreateReadStream = vi.fn();
	return {
		...actual,
		default: {
			...actual,
			createReadStream: mockCreateReadStream,
		},
		createReadStream: mockCreateReadStream,
	};
});

describe("file.service", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("resolveSafePath", () => {
		it("should return raw path if absolute and no root specified", () => {
			const abs = path.resolve("/tmp/file.txt");
			expect(resolveSafePath(abs)).toBe(abs);
		});

		it("should resolve relative path against cwd if no root specified", () => {
			expect(resolveSafePath("file.txt")).toBe(path.resolve("file.txt"));
		});

		it("should resolve path correctly within root directory", () => {
			const root = path.resolve("/var/www");
			const safe = resolveSafePath("images/photo.png", root);
			expect(safe).toBe(path.resolve(root, "images/photo.png"));
		});

		it("should return null for directory traversal attempts outside root", () => {
			const root = path.resolve("/var/www");
			const unsafe = resolveSafePath("../../etc/passwd", root);
			expect(unsafe).toBeNull();
		});
	});

	describe("handleStreamError", () => {
		it("should send 500 when headers are not sent", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const raw = {
				end: vi.fn(),
				writableEnded: false,
			} as unknown as ServerResponse;
			const setStatusCode = vi.fn();
			const err = new Error("Stream read error") as NodeJS.ErrnoException;

			handleStreamError(raw, false, err, setStatusCode);

			expect(errorSpy).toHaveBeenCalled();
			expect(setStatusCode).toHaveBeenCalledWith(500);
			expect(raw.end).toHaveBeenCalledWith("Internal Server Error");
			errorSpy.mockRestore();
		});

		it("should end stream gracefully when headers are already sent", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const raw = {
				end: vi.fn(),
				writableEnded: false,
			} as unknown as ServerResponse;
			const setStatusCode = vi.fn();
			const err = new Error("Stream mid-pipe error") as NodeJS.ErrnoException;

			handleStreamError(raw, true, err, setStatusCode);

			expect(setStatusCode).not.toHaveBeenCalled();
			expect(raw.end).toHaveBeenCalledWith();
			errorSpy.mockRestore();
		});

		it("should do nothing if writableEnded is true when headers are sent", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const raw = {
				end: vi.fn(),
				writableEnded: true,
			} as unknown as ServerResponse;
			const setStatusCode = vi.fn();
			const err = new Error("Stream error") as NodeJS.ErrnoException;

			handleStreamError(raw, true, err, setStatusCode);

			expect(raw.end).not.toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	});

	describe("pipeFile", () => {
		it("should create read stream, register error handler, and pipe to response", () => {
			const mockStream = {
				on: vi.fn().mockReturnThis(),
				pipe: vi.fn(),
			};

			vi.mocked(createReadStream).mockReturnValue(
				mockStream as unknown as ReturnType<typeof createReadStream>,
			);

			const raw = new Writable({
				write(_chunk, _encoding, callback) {
					callback();
				},
			}) as unknown as ServerResponse;
			raw.end = vi.fn() as any;

			const setStatusCode = vi.fn();

			pipeFile(raw, false, "/safe/path.txt", setStatusCode);

			expect(createReadStream).toHaveBeenCalledWith("/safe/path.txt");
			expect(mockStream.on).toHaveBeenCalledWith("error", expect.any(Function));
			expect(mockStream.pipe).toHaveBeenCalledWith(raw);
		});
	});
});
