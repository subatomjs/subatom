/// <reference types="node" />
import { describe, test, expect, vi } from "vitest";
import {
	Context,
	getOrCreateContext,
} from "../../../packages/context/Context.js";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type {
	IResponse,
	IResponseHelper,
	CookieOptions,
	DownloadOptions,
	FormatHandlers,
	SendFileOptions,
} from "../../../packages/core/http/response/types/response.types.js";
import type { ISession } from "../../../packages/pipelines/middlewares/types/session.types.js";
import { Readable } from "node:stream";

const createMockReq = (
	overrides: Partial<Record<string, unknown>> = {},
): IRequest => {
	return {
		params: { id: "123" },
		query: { search: "test" },
		body: { name: "Subatom" },
		headers: { authorization: "Bearer token" },
		cookies: { sid: "abc" },
		files: { avatar: {} },
		file: {},
		user: { id: "user_1" },
		locals: { traceId: "xyz" },
		ip: "127.0.0.1",
		method: "POST",
		path: "/api/test",
		url: "/api/test?search=test",
		protocol: "https",
		secure: true,
		host: "localhost:3000",
		hostname: "localhost",
		session: { id: "sess_1" } as unknown as ISession,
		sessionID: "sess_1",
		get: vi.fn((header: string) =>
			header === "authorization" ? "Bearer token" : undefined,
		),
		accepts: vi.fn((...args: unknown[]) => args[0] === "json"),
		...overrides,
	} as unknown as IRequest;
};

const createMockRes = (
	overrides: Partial<Record<string, unknown>> = {},
): IResponse => {
	return {
		headersSent: false,
		writableEnded: false,
		statusCode: 200,
		helper: {} as IResponseHelper,
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
		send: vi.fn(),
		html: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		header: vi.fn().mockReturnThis(),
		setHeader: vi.fn().mockReturnThis(),
		type: vi.fn().mockReturnThis(),
		contentType: vi.fn().mockReturnThis(),
		cookie: vi.fn().mockReturnThis(),
		clearCookie: vi.fn().mockReturnThis(),
		redirect: vi.fn(),
		attachment: vi.fn().mockReturnThis(),
		sendFile: vi.fn(),
		download: vi.fn(),
		stream: vi.fn().mockResolvedValue(undefined),
		end: vi.fn(),
		format: vi.fn().mockReturnThis(),
		...overrides,
	} as unknown as IResponse;
};

describe("Context", () => {
	test("initializes with req and res and exposes aliases", () => {
		const req = createMockReq();
		const res = createMockRes();
		const ctx = new Context(req, res);

		expect(ctx.req).toBe(req);
		expect(ctx.res).toBe(res);
		expect(ctx.request).toBe(req);
		expect(ctx.response).toBe(res);
	});

	test("forwards request data facades correctly with existing values", () => {
		const req = createMockReq();
		const res = createMockRes();
		const ctx = new Context(req, res);

		expect(ctx.params).toBe(req.params);
		expect(ctx.query).toBe(req.query);
		expect(ctx.body).toBe(req.body);
		expect(ctx.headers).toBe(req.headers);
		expect(ctx.cookies).toBe(req.cookies);
		expect(ctx.files).toBe(req.files);
		expect(ctx.file).toBe(req.file);
		expect(ctx.user).toBe(req.user);
		expect(ctx.locals).toBe(req.locals);
	});

	test("falls back to empty objects for falsy params, query, and cookies", () => {
		const req = createMockReq({
			params: undefined,
			query: undefined,
			cookies: undefined,
		});
		const res = createMockRes();
		const ctx = new Context(req, res);

		expect(ctx.params).toEqual({});
		expect(ctx.query).toEqual({});
		expect(ctx.cookies).toEqual({});
	});

	test("mutates user and locals via setters", () => {
		const req = createMockReq();
		const res = createMockRes();
		const ctx = new Context(req, res);

		ctx.user = { id: "new_user" };
		expect(req.user).toEqual({ id: "new_user" });
		expect(ctx.user).toEqual({ id: "new_user" });

		ctx.locals = { traceId: "new_trace" };
		expect(req.locals).toEqual({ traceId: "new_trace" });
		expect(ctx.locals).toEqual({ traceId: "new_trace" });
	});

	test("forwards request properties correctly", () => {
		const req = createMockReq();
		const res = createMockRes();
		const ctx = new Context(req, res);

		expect(ctx.ip).toBe("127.0.0.1");
		expect(ctx.method).toBe("POST");
		expect(ctx.path).toBe("/api/test");
		expect(ctx.url).toBe("/api/test?search=test");
		expect(ctx.protocol).toBe("https");
		expect(ctx.secure).toBe(true);
		expect(ctx.host).toBe("localhost:3000");
		expect(ctx.hostname).toBe("localhost");
		expect(ctx.session).toBe(req.session);
		expect(ctx.sessionID).toBe("sess_1");
	});

	test("forwards response properties correctly", () => {
		const req = createMockReq();
		const helperObj = {} as IResponseHelper;
		const res = createMockRes({
			headersSent: true,
			writableEnded: true,
			statusCode: 404,
			helper: helperObj,
		});
		const ctx = new Context(req, res);

		expect(ctx.headersSent).toBe(true);
		expect(ctx.writableEnded).toBe(true);
		expect(ctx.statusCode).toBe(404);
		expect(ctx.helper).toBe(helperObj);
	});

	test("delegates request methods", () => {
		const req = createMockReq();
		const res = createMockRes();
		const ctx = new Context(req, res);

		expect(ctx.get("authorization")).toBe("Bearer token");
		expect(req.get).toHaveBeenCalledWith("authorization");

		expect(ctx.accepts("json")).toBe(true);
		expect(req.accepts).toHaveBeenCalledWith("json");

		ctx.accepts("json", "html");
		expect(req.accepts).toHaveBeenCalledWith("json", "html");

		ctx.accepts(["json", "html"]);
		expect(req.accepts).toHaveBeenCalledWith(["json", "html"]);
	});

	test("delegates chainable response methods returning context instance", () => {
		const req = createMockReq();
		const res = createMockRes();
		const ctx = new Context(req, res);

		expect(ctx.status(201)).toBe(ctx);
		expect(res.status).toHaveBeenCalledWith(201);

		expect(ctx.json({ ok: true })).toBe(ctx);
		expect(res.json).toHaveBeenCalledWith({ ok: true });

		expect(ctx.html("<h1>Hello</h1>")).toBe(ctx);
		expect(res.html).toHaveBeenCalledWith("<h1>Hello</h1>");

		expect(ctx.header("X-Custom", "val")).toBe(ctx);
		expect(res.header).toHaveBeenCalledWith("X-Custom", "val");

		expect(ctx.setHeader("X-Other", "val2")).toBe(ctx);
		expect(res.setHeader).toHaveBeenCalledWith("X-Other", "val2");

		expect(ctx.type("application/json")).toBe(ctx);
		expect(res.type).toHaveBeenCalledWith("application/json");

		expect(ctx.contentType("text/plain")).toBe(ctx);
		expect(res.contentType).toHaveBeenCalledWith("text/plain");

		const cookieOpts: CookieOptions = { httpOnly: true };
		expect(ctx.cookie("token", "xyz", cookieOpts)).toBe(ctx);
		expect(res.cookie).toHaveBeenCalledWith("token", "xyz", cookieOpts);

		expect(ctx.clearCookie("token", cookieOpts)).toBe(ctx);
		expect(res.clearCookie).toHaveBeenCalledWith("token", cookieOpts);

		expect(ctx.attachment("report.pdf")).toBe(ctx);
		expect(res.attachment).toHaveBeenCalledWith("report.pdf");
	});

	test("handles all set() branch variations", () => {
		const req = createMockReq();
		const res = createMockRes();
		const ctx = new Context(req, res);

		// String name with string/array value
		expect(ctx.set("Content-Type", "text/html")).toBe(ctx);
		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/html");

		// String name with falsy value (defaults to 'N/A')
		expect(ctx.set("X-Empty", "")).toBe(ctx);
		expect(res.set).toHaveBeenCalledWith("X-Empty", "N/A");

		// Object of headers
		const headers = { "X-Rate": "100" };
		expect(ctx.set(headers)).toBe(ctx);
		expect(res.set).toHaveBeenCalledWith(headers);
	});

	test("delegates terminal response methods", async () => {
		const req = createMockReq();
		const res = createMockRes();
		const ctx = new Context(req, res);

		ctx.send("body content");
		expect(res.send).toHaveBeenCalledWith("body content");

		ctx.redirect("/login", 302);
		expect(res.redirect).toHaveBeenCalledWith("/login", 302);

		const sendOpts: SendFileOptions = {};
		ctx.sendFile("/path/to/file", sendOpts);
		expect(res.sendFile).toHaveBeenCalledWith("/path/to/file", sendOpts);

		const downloadOpts: DownloadOptions = {};
		ctx.download("/path/to/file", "custom.pdf", downloadOpts);
		expect(res.download).toHaveBeenCalledWith(
			"/path/to/file",
			"custom.pdf",
			downloadOpts,
		);

		const stream = new Readable({ read() {} });
		const streamPromise = ctx.stream(stream);
		expect(res.stream).toHaveBeenCalledWith(stream);
		await expect(streamPromise).resolves.toBeUndefined();

		ctx.end("final chunk");
		expect(res.end).toHaveBeenCalledWith("final chunk");
	});

	test("delegates format() using provided requestHeaders or falling back to req.headers", () => {
		const req = createMockReq({ headers: { accept: "text/plain" } });
		const res = createMockRes();
		const ctx = new Context(req, res);

		const handlers: FormatHandlers = { default: vi.fn() };

		// Fallback branch: requestHeaders not passed
		expect(ctx.format(handlers)).toBe(ctx);
		expect(res.format).toHaveBeenCalledWith(handlers, req.headers);

		// Explicit branch: custom requestHeaders provided
		const customHeaders = { accept: "application/json" };
		expect(ctx.format(handlers, customHeaders)).toBe(ctx);
		expect(res.format).toHaveBeenCalledWith(handlers, customHeaders);
	});
});

describe("getOrCreateContext", () => {
	test("creates a new Context and attaches it with non-enumerable descriptor when not present", () => {
		const req = createMockReq();
		const res = createMockRes();

		const ctx = getOrCreateContext(req, res);

		expect(ctx).toBeInstanceOf(Context);
		expect(ctx.req).toBe(req);
		expect(ctx.res).toBe(res);

		const symbolKey = Symbol.for("subatom.context");
		const descriptor = Object.getOwnPropertyDescriptor(req, symbolKey);
		expect(descriptor).toBeDefined();
		expect(descriptor?.value).toBe(ctx);
		expect(descriptor?.writable).toBe(false);
		expect(descriptor?.enumerable).toBe(false);
		expect(descriptor?.configurable).toBe(false);
	});

	test("returns existing Context on subsequent invocations without creating a new one", () => {
		const req = createMockReq();
		const res1 = createMockRes();
		const res2 = createMockRes();

		const firstCtx = getOrCreateContext(req, res1);
		const secondCtx = getOrCreateContext(req, res2);

		expect(firstCtx).toBe(secondCtx);
		expect(secondCtx.res).toBe(res1);
	});
});
