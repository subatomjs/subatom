import { describe, it, expect, vi, beforeEach } from "vitest";
import { IncomingMessage, type ServerResponse } from "node:http";
import { Socket } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { streaming } from "../../../packages/pipelines/middlewares/streaming.js";
import { serveStatic } from "../../../packages/pipelines/middlewares/serveStatic.js";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		default: {
			...actual,
			existsSync: vi.fn(actual.existsSync),
			mkdirSync: vi.fn(),
			createReadStream: vi.fn(actual.createReadStream),
			promises: {
				...actual.promises,
				stat: vi.fn(actual.promises.stat),
			},
		},
		existsSync: vi.fn(actual.existsSync),
		mkdirSync: vi.fn(),
		createReadStream: vi.fn(actual.createReadStream),
		promises: {
			...actual.promises,
			stat: vi.fn(actual.promises.stat),
		},
	};
});

describe("streaming & serveStatic Middlewares", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("streaming()", () => {
		it("should bypass and call next() if content-type does not match acceptTypes", async () => {
			const reqRaw = new IncomingMessage(new Socket());
			reqRaw.headers = { "content-type": "text/html" };
			const req = { raw: reqRaw } as IRequest;
			const res = {} as IResponse;
			const next = vi.fn();

			await streaming()(req, res, next);

			expect(req.bodyStream).toBeUndefined();
			expect(next).toHaveBeenCalled();
		});

		it("should bind req.raw to req.bodyStream when matching pattern", async () => {
			const reqRaw = new IncomingMessage(new Socket());
			reqRaw.headers = { "content-type": "video/mp4" };
			const req = { raw: reqRaw } as IRequest;
			const res = {} as IResponse;
			const next = vi.fn();

			await streaming()(req, res, next);

			expect(req.bodyStream).toBe(reqRaw);
			expect(next).toHaveBeenCalled();
		});

		it("should handle stream errors with fallback 400 response", async () => {
			const reqRaw = new IncomingMessage(new Socket());
			reqRaw.headers = { "content-type": "application/octet-stream" };
			const req = { raw: reqRaw } as IRequest;

			const resHelper = {
				headersSent: false,
				statusCode: 200,
				sentJson: undefined as unknown,
				status: vi.fn((code: number) => {
					resHelper.statusCode = code;
					return {
						json: vi.fn((payload: unknown) => {
							resHelper.sentJson = payload;
						}),
					};
				}),
			};

			await streaming()(req, resHelper as unknown as IResponse, vi.fn());

			reqRaw.emit("error", new Error("Network interruption"));

			expect(resHelper.statusCode).toBe(400);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Stream read error",
			});
		});

		it("should delegate to onStreamError custom callback when provided", async () => {
			const reqRaw = new IncomingMessage(new Socket());
			reqRaw.headers = { "content-type": "application/octet-stream" };
			const req = { raw: reqRaw } as IRequest;
			const res = {} as IResponse;
			const onStreamError = vi.fn();

			await streaming({ onStreamError })(req, res, vi.fn());

			const streamErr = new Error("Custom stream error");
			reqRaw.emit("error", streamErr);

			expect(onStreamError).toHaveBeenCalledWith(streamErr, req, res);
		});
	});

	describe("serveStatic()", () => {
		const root = path.resolve(process.cwd(), "public_test_dir");

		it("should automatically create static root directory if autoCreateDir is true", () => {
			vi.mocked(fs.existsSync).mockReturnValueOnce(false);

			serveStatic(root, { autoCreateDir: true });

			expect(fs.mkdirSync).toHaveBeenCalledWith(root, { recursive: true });
		});

		it("should skip requests with non-GET and non-HEAD methods", async () => {
			const middleware = serveStatic(root);
			const req = {
				raw: { method: "POST", url: "/style.css" },
			} as unknown as IRequest;
			const res = {} as IResponse;
			const next = vi.fn();

			await middleware(req, res, next);
			expect(next).toHaveBeenCalled();
		});

		it("should deny dotfiles when dotfiles is set to 'deny'", async () => {
			const middleware = serveStatic(root, { dotfiles: "deny" });
			const req = {
				raw: { method: "GET", url: "/.env" },
			} as unknown as IRequest;

			const resHelper = {
				statusCode: 200,
				status: vi.fn((code: number) => {
					resHelper.statusCode = code;
					return { json: vi.fn() };
				}),
			};

			await middleware(req, resHelper as unknown as IResponse, vi.fn());
			expect(resHelper.statusCode).toBe(403);
		});

		it("should ignore dotfiles and call next() when dotfiles is set to 'ignore'", async () => {
			const middleware = serveStatic(root, { dotfiles: "ignore" });
			const req = {
				raw: { method: "GET", url: "/.git/config" },
			} as unknown as IRequest;
			const next = vi.fn();

			await middleware(req, {} as IResponse, next);
			expect(next).toHaveBeenCalled();
		});

		it("should prevent directory traversal outside root", async () => {
			const middleware = serveStatic(root);
			const req = {
				raw: { method: "GET", url: "/../../../../etc/passwd" },
			} as unknown as IRequest;
			const next = vi.fn();

			await middleware(req, {} as IResponse, next);
			expect(next).toHaveBeenCalled();
		});

		it("should serve index.html when directory is requested", async () => {
			const middleware = serveStatic(root);
			const req = { raw: { method: "GET", url: "/" } } as unknown as IRequest;

			const mockStatsDir = {
				isDirectory: () => true,
				isFile: () => false,
				size: 0,
			} as fs.Stats;
			const mockStatsFile = {
				isDirectory: () => false,
				isFile: () => true,
				size: 100,
			} as fs.Stats;

			vi.mocked(fs.promises.stat)
				.mockResolvedValueOnce(mockStatsDir)
				.mockResolvedValueOnce(mockStatsFile);

			const fileStream = new PassThrough();
			vi.mocked(fs.createReadStream).mockReturnValueOnce(
				fileStream as unknown as fs.ReadStream,
			);

			const rawRes = new Writable({
				write(_chunk, _encoding, callback) {
					callback();
				},
			});

			const res = {
				raw: rawRes as unknown as ServerResponse,
				headersSent: false,
				writableEnded: false,
				setHeader: vi.fn(),
				status: vi.fn(),
			} as unknown as IResponse;

			const promise = middleware(req, res, vi.fn());

			// Push data and trigger close to settle Promise immediately
			process.nextTick(() => {
				fileStream.push("<h1>Index</h1>");
				fileStream.push(null);
				rawRes.emit("close");
			});

			await promise;

			expect(res.setHeader).toHaveBeenCalledWith(
				"Content-Type",
				"text/html; charset=utf-8",
			);
			expect(res.setHeader).toHaveBeenCalledWith("Content-Length", "100");
		});

		it("should respond immediately without streaming body on HEAD request", async () => {
			const middleware = serveStatic(root);
			const req = {
				raw: { method: "HEAD", url: "/script.js" },
			} as unknown as IRequest;

			const mockStatsFile = {
				isDirectory: () => false,
				isFile: () => true,
				size: 50,
			} as fs.Stats;
			vi.mocked(fs.promises.stat).mockResolvedValueOnce(mockStatsFile);

			const res = {
				raw: new PassThrough() as unknown as ServerResponse,
				headersSent: false,
				writableEnded: false,
				setHeader: vi.fn(),
				status: vi.fn().mockReturnValue({ end: vi.fn() }),
			} as unknown as IResponse;

			await middleware(req, res, vi.fn());

			expect(res.setHeader).toHaveBeenCalledWith(
				"Content-Type",
				"text/javascript; charset=utf-8",
			);
			expect(res.status).toHaveBeenCalledWith(200);
		});

		it("should fall back when a directory without a trailing slash has no index file", async () => {
			// Arrange
			const middleware = serveStatic(root);
			const req = {
				raw: { method: "GET", url: "/docs" },
			} as unknown as IRequest;
			const directoryStats = {
				isDirectory: () => true,
				isFile: () => false,
				size: 0,
			} as fs.Stats;
			vi.mocked(fs.promises.stat)
				.mockResolvedValueOnce(directoryStats)
				.mockRejectedValueOnce(new Error("Missing index"));
			const next = vi.fn();

			// Act
			await middleware(req, {} as IResponse, next);

			// Assert
			expect(fs.promises.stat).toHaveBeenCalledTimes(2);
			expect(next).toHaveBeenCalledOnce();
		});

		it("should serve hidden files when dotfiles are explicitly allowed", async () => {
			// Arrange
			const middleware = serveStatic(root, { dotfiles: "allow" });
			const req = {
				raw: { method: "HEAD", url: "/.well-known" },
			} as unknown as IRequest;
			const fileStats = {
				isDirectory: () => false,
				isFile: () => true,
				size: 0,
			} as fs.Stats;
			vi.mocked(fs.promises.stat).mockResolvedValueOnce(fileStats);
			const res = {
				raw: new PassThrough() as unknown as ServerResponse,
				headersSent: false,
				writableEnded: false,
				setHeader: vi.fn(),
				status: vi.fn().mockReturnValue({ end: vi.fn() }),
			} as unknown as IResponse;

			// Act
			await middleware(req, res, vi.fn());

			// Assert
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.setHeader).toHaveBeenCalledWith("Content-Length", "0");
		});

		it("should fall back for a filesystem entry that is neither a file nor directory", async () => {
			// Arrange
			const middleware = serveStatic(root);
			const req = {
				raw: { method: "GET", url: "/socket" },
			} as unknown as IRequest;
			vi.mocked(fs.promises.stat).mockResolvedValueOnce({
				isDirectory: () => false,
				isFile: () => false,
				size: 0,
			} as fs.Stats);
			const next = vi.fn();

			// Act
			await middleware(req, {} as IResponse, next);

			// Assert
			expect(next).toHaveBeenCalledOnce();
		});

		it("should not stream when the response is already finished", async () => {
			// Arrange
			const middleware = serveStatic(root);
			const req = {
				raw: { method: "GET", url: "/asset.js" },
			} as unknown as IRequest;
			vi.mocked(fs.promises.stat).mockResolvedValueOnce({
				isDirectory: () => false,
				isFile: () => true,
				size: 1,
			} as fs.Stats);
			const res = {
				headersSent: false,
				writableEnded: true,
				setHeader: vi.fn(),
			} as unknown as IResponse;

			// Act
			await middleware(req, res, vi.fn());

			// Assert
			expect(res.setHeader).not.toHaveBeenCalled();
			expect(fs.createReadStream).not.toHaveBeenCalled();
		});

		it("should pass read stream errors to next before response headers are sent", async () => {
			// Arrange
			const middleware = serveStatic(root);
			const req = {
				raw: { method: "GET", url: "/broken.js" },
			} as unknown as IRequest;
			vi.mocked(fs.promises.stat).mockResolvedValueOnce({
				isDirectory: () => false,
				isFile: () => true,
				size: 1,
			} as fs.Stats);
			const readStream = new PassThrough();
			vi.mocked(fs.createReadStream).mockReturnValueOnce(
				readStream as unknown as fs.ReadStream,
			);
			const raw = new Writable({
				write(_chunk, _encoding, callback) {
					callback();
				},
			});
			const res = {
				raw: raw as unknown as ServerResponse,
				headersSent: false,
				writableEnded: false,
				setHeader: vi.fn(),
				status: vi.fn(),
			} as unknown as IResponse;
			const next = vi.fn();

			// Act
			const completion = middleware(req, res, next);
			await new Promise<void>((resolve) => setImmediate(resolve));
			readStream.emit("error", new Error("read failure"));
			await completion;

			// Assert
			expect(next).toHaveBeenCalledWith(
				expect.objectContaining({ message: "read failure" }),
			);
		});
	});
});
