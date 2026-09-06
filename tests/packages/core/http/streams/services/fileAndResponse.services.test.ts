import type fs from "node:fs";
import * as fsp from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough, Readable } from "node:stream";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	parseRange,
	streamFileToResponse,
} from "../../../../../../packages/core/http/streams/services/streamFile.service.js";
import { streamResponse } from "../../../../../../packages/core/http/streams/services/streamResponse.service.js";
import { RangeNotSatisfiableError } from "../../../../../../packages/core/http/streams/types/stream.types.js";
import * as pipelineService from "../../../../../../packages/core/http/streams/services/pipeline.service.js";

const mockCreateReadStream = vi.fn((..._args: unknown[]) => new PassThrough());
const mockStat = vi.fn();

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return {
		...actual,
		createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
		stat: (...args: unknown[]) => mockStat(...args),
		default: {
			...actual,
			createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
		},
	};
});

vi.mock("node:fs/promises", () => ({
	stat: vi.fn(),
}));

describe("File & Response Streaming Services", () => {
	const pipeSpy = vi
		.spyOn(pipelineService, "pipeToResponse")
		.mockResolvedValue();

	describe("parseRange", () => {
		const fileSize = 1000;

		it("should return null if header is missing or does not start with bytes=", () => {
			expect(parseRange(undefined, fileSize)).toBeNull();
			expect(parseRange("items=0-10", fileSize)).toBeNull();
		});

		it("should throw RangeNotSatisfiableError on invalid syntax or out-of-bounds offsets", () => {
			expect(() => parseRange("bytes=500-100", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
			expect(() => parseRange("bytes=1500-2000", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
			expect(() => parseRange("bytes=abc-200", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
			expect(() => parseRange("bytes=100-abc", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
			expect(() => parseRange("bytes=invalid-end", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
		});

		it("should parse standard start-end ranges", () => {
			expect(parseRange("bytes=0-499", fileSize)).toEqual({
				start: 0,
				end: 499,
			});
		});

		it("should parse open-ended start- ranges", () => {
			expect(parseRange("bytes=500-", fileSize)).toEqual({
				start: 500,
				end: 999,
			});
		});

		it("should parse suffix -N ranges and cap start at 0 when suffix exceeds size", () => {
			expect(parseRange("bytes=-200", fileSize)).toEqual({
				start: 800,
				end: 999,
			});
			expect(parseRange("bytes=-2000", fileSize)).toEqual({
				start: 0,
				end: 999,
			});
		});

		it("should throw RangeNotSatisfiableError on invalid suffix syntax", () => {
			expect(() => parseRange("bytes=-abc", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
			expect(() => parseRange("bytes=-0", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
			expect(() => parseRange("bytes=--5", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
		});

		it("should throw RangeNotSatisfiableError on invalid syntax or out-of-bounds offsets", () => {
			expect(() => parseRange("bytes=500-100", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
			expect(() => parseRange("bytes=1500-2000", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
			expect(() => parseRange("bytes=invalid-end", fileSize)).toThrow(
				RangeNotSatisfiableError,
			);
		});
	});

	describe("streamFileToResponse", () => {
		let req: IncomingMessage;
		let raw: ServerResponse;
		let headers: Map<string, string | number>;

		beforeEach(() => {
			pipeSpy.mockClear();
			mockCreateReadStream.mockClear();
			mockCreateReadStream.mockReturnValue(new PassThrough());
			headers = new Map();
			req = { headers: {} } as IncomingMessage;
			raw = {
				statusCode: 200,
				setHeader: vi.fn((k: string, v: string | number) => {
					headers.set(k.toLowerCase(), v);
				}),
				end: vi.fn(),
			} as unknown as ServerResponse;

			vi.mocked(fsp.stat).mockResolvedValue({ size: 1000 } as fs.Stats);
		});

		it("should stream entire file when no Range header is provided and set custom headers", async () => {
			raw.statusCode = 203;
			await streamFileToResponse(req, raw, "/static/file.txt", {
				contentType: "text/plain",
				headers: { "X-Custom": "header-val" },
			});

			expect(raw.statusCode).toBe(203);
			expect(headers.get("x-custom")).toBe("header-val");
			expect(headers.get("content-type")).toBe("text/plain");
			expect(headers.get("content-length")).toBe(1000);
			expect(headers.get("accept-ranges")).toBe("bytes");
			expect(pipeSpy).toHaveBeenCalledTimes(1);
		});

		it("should respond with 206 Partial Content when Range is satisfiable", async () => {
			req.headers.range = "bytes=0-499";

			await streamFileToResponse(req, raw, "/static/file.txt");

			expect(raw.statusCode).toBe(206);
			expect(headers.get("content-range")).toBe("bytes 0-499/1000");
			expect(headers.get("content-length")).toBe(500);
			expect(mockCreateReadStream).toHaveBeenCalledWith("/static/file.txt", {
				start: 0,
				end: 499,
			});
			expect(pipeSpy).toHaveBeenCalledTimes(1);
		});

		it("should respond with 416 when Range is unsatisfiable", async () => {
			req.headers.range = "bytes=2000-3000";

			await streamFileToResponse(req, raw, "/static/file.txt");

			expect(raw.statusCode).toBe(416);
			expect(headers.get("content-range")).toBe("bytes */1000");
			expect(raw.end).toHaveBeenCalledTimes(1);
			expect(pipeSpy).not.toHaveBeenCalled();
		});

		it("should rethrow unexpected errors occurring during range parsing", async () => {
			req.headers.range = "bytes=0-499";
			const customError = new TypeError("Unexpected range failure");
			vi.spyOn(String.prototype, "split").mockImplementationOnce(() => {
				throw customError;
			});

			await expect(
				streamFileToResponse(req, raw, "/static/file.txt"),
			).rejects.toThrow("Unexpected range failure");
		});
	});

	describe("streamResponse", () => {
		it("should set status, content headers, and pipe stream", async () => {
			const headers = new Map<string, string | number>();
			const raw = {
				headersSent: false,
				statusCode: 200,
				setHeader: vi.fn((k: string, v: string | number) => {
					headers.set(k, v);
				}),
			} as unknown as ServerResponse;

			const source = Readable.from(["stream data"]);
			pipeSpy.mockClear();

			await streamResponse(raw, source, {
				status: 202,
				contentType: "application/octet-stream",
				contentLength: 11,
				headers: { "X-Stream-Id": "123" },
			});

			expect(raw.statusCode).toBe(202);
			expect(headers.get("Content-Type")).toBe("application/octet-stream");
			expect(headers.get("Content-Length")).toBe(11);
			expect(headers.get("X-Stream-Id")).toBe("123");
			expect(pipeSpy).toHaveBeenCalledWith(raw, source, expect.any(Object));
		});

		it("should fallback to raw.statusCode when options.status is omitted", async () => {
			const raw = {
				headersSent: false,
				statusCode: 304,
				setHeader: vi.fn(),
			} as unknown as ServerResponse;

			const source = Readable.from(["data"]);
			pipeSpy.mockClear();

			await streamResponse(raw, source);

			expect(raw.statusCode).toBe(304);
			expect(pipeSpy).toHaveBeenCalled();
		});

		it("should skip setting headers if headersSent is true", async () => {
			const setHeaderSpy = vi.fn();
			const raw = {
				headersSent: true,
				statusCode: 200,
				setHeader: setHeaderSpy,
			} as unknown as ServerResponse;

			const source = Readable.from(["data"]);
			pipeSpy.mockClear();

			await streamResponse(raw, source, {
				status: 201,
				contentType: "text/plain",
			});

			expect(setHeaderSpy).not.toHaveBeenCalled();
			expect(raw.statusCode).toBe(200);
			expect(pipeSpy).toHaveBeenCalled();
		});
	});
});
