/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { serveStatic } from "../../../package/core/factory-functions/serveStatic.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

// Must not start with a dot '.' so the directory itself is not flagged as a dotfile
const TEST_DIR = path.resolve(process.cwd(), "tmp-static-test-dir");

function createMockHttp(options: { method?: string; url?: string }) {
	const rawResStream = new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		},
	}) as any;
	rawResStream.headersSent = false;

	let statusCode = 0;
	const headers: Record<string, string> = {};

	const req = {
		method: options.method ?? "GET",
		url: options.url ?? "/",
		raw: {
			method: options.method ?? "GET",
			url: options.url ?? "/",
			headers: {},
		},
	} as unknown as IRequest;

	const res = {
		raw: rawResStream,
		status(code: number) {
			statusCode = code;
			return this;
		},
		setHeader(key: string, value: string) {
			headers[key.toLowerCase()] = value;
			headers[key] = value;
			return this;
		},
		json: vi.fn((data: any) => data),
		end: vi.fn(),
	} as unknown as IResponse;

	return {
		req,
		res,
		rawResStream,
		getStatus: () => statusCode,
		getHeaders: () => headers,
	};
}

describe("serveStatic Middleware", () => {
	beforeAll(() => {
		fs.mkdirSync(TEST_DIR, { recursive: true });
		fs.writeFileSync(path.join(TEST_DIR, "index.html"), "<h1>Index Page</h1>");
		fs.writeFileSync(path.join(TEST_DIR, "style.css"), "body { margin: 0; }");
		fs.writeFileSync(path.join(TEST_DIR, ".env"), "SECRET=true");
	});

	afterAll(() => {
		if (fs.existsSync(TEST_DIR)) {
			fs.rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	it("should bypass non-GET and non-HEAD requests", async () => {
		const middleware = serveStatic(TEST_DIR);
		const { req, res } = createMockHttp({ method: "POST", url: "/style.css" });
		const next = vi.fn();

		await middleware(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should serve index.html when root path '/' is requested", async () => {
		const middleware = serveStatic(TEST_DIR, { index: "index.html" });
		const { req, res, getStatus, getHeaders } = createMockHttp({
			method: "GET",
			url: "/",
		});
		const next = vi.fn();

		await middleware(req, res, next);

		expect(getStatus()).toBe(200);
		const contentType =
			getHeaders()["content-type"] || getHeaders()["Content-Type"];
		expect(contentType).toBeDefined();
		expect(contentType).toContain("text/html");
		expect(getHeaders()["content-length"]).toBeDefined();
		expect(next).not.toHaveBeenCalled();
	});

	it("should serve specific static file with proper headers", async () => {
		const middleware = serveStatic(TEST_DIR);
		const { req, res, getStatus, getHeaders } = createMockHttp({
			method: "GET",
			url: "/style.css",
		});
		const next = vi.fn();

		await middleware(req, res, next);

		expect(getStatus()).toBe(200);
		const contentType =
			getHeaders()["content-type"] || getHeaders()["Content-Type"];
		expect(contentType).toBeDefined();
		expect(contentType).toContain("text/css");
		expect(next).not.toHaveBeenCalled();
	});

	it("should handle HEAD requests by sending headers without streaming body", async () => {
		const middleware = serveStatic(TEST_DIR);
		const { req, res, getStatus, getHeaders } = createMockHttp({
			method: "HEAD",
			url: "/style.css",
		});
		const next = vi.fn();

		await middleware(req, res, next);

		expect(getStatus()).toBe(200);
		const contentType =
			getHeaders()["content-type"] || getHeaders()["Content-Type"];
		expect(contentType).toBeDefined();
		expect(contentType).toContain("text/css");
		expect(res.end).toHaveBeenCalledTimes(1);
	});

	it("should deny access to dotfiles when dotfiles option is 'deny'", async () => {
		const middleware = serveStatic(TEST_DIR, { dotfiles: "deny" });
		const { req, res, getStatus } = createMockHttp({
			method: "GET",
			url: "/.env",
		});
		const next = vi.fn();

		await middleware(req, res, next);

		expect(getStatus()).toBe(403);
		expect(res.json).toHaveBeenCalledWith({ message: "Forbidden" });
		expect(next).not.toHaveBeenCalled();
	});

	it("should ignore dotfiles and call next() when dotfiles option is 'ignore'", async () => {
		const middleware = serveStatic(TEST_DIR, { dotfiles: "ignore" });
		const { req, res } = createMockHttp({ method: "GET", url: "/.env" });
		const next = vi.fn();

		await middleware(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should prevent directory traversal attacks safely", async () => {
		const middleware = serveStatic(TEST_DIR);
		const { req, res } = createMockHttp({
			method: "GET",
			url: "/../../etc/passwd",
		});
		const next = vi.fn();

		await middleware(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should call next() if file does not exist", async () => {
		const middleware = serveStatic(TEST_DIR);
		const { req, res } = createMockHttp({
			method: "GET",
			url: "/not-found.png",
		});
		const next = vi.fn();

		await middleware(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
	});
});
