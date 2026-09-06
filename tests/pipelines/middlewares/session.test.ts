import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerResponse, IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { session } from "../../../packages/pipelines/middlewares/session.js";
import { MemoryStore } from "../../../packages/pipelines/middlewares/utils/memory/MemoryStore.js";
import { sign } from "../../../packages/pipelines/middlewares/utils/signatures/signatures.js";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";
import type { ISessionStore } from "../../../packages/pipelines/middlewares/types/session.types.js";

function createMockSessionContext(cookieHeader?: string) {
	const reqRaw = new IncomingMessage(new Socket());
	reqRaw.headers = {
		cookie: cookieHeader,
	};

	const rawRes = new ServerResponse(reqRaw);
	rawRes.end = vi.fn(function (this: ServerResponse) {
		return this;
	}) as unknown as typeof rawRes.end;

	const headersMap: Record<string, string> = {};
	const res = {
		raw: rawRes,
		setHeader: vi.fn((key: string, val: string) => {
			headersMap[key] = val;
		}),
	} as unknown as IResponse;

	const req = {
		raw: reqRaw,
	} as unknown as IRequest;

	return { req, res, rawRes, headersMap };
}

describe("session() Middleware", () => {
	const secret = "session-test-secret";

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should throw error if secret option is missing", () => {
		expect(() => session({} as never)).toThrow(
			"session middleware requires a `secret`",
		);
	});

	it("should allow in-memory store in production when allowInMemoryInProduction is true", () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";

		expect(() =>
			session({ secret, allowInMemoryInProduction: true }),
		).not.toThrow();

		process.env.NODE_ENV = originalEnv;
	});

	it("should throw error in production environment when store is missing and REDIS_URL not set", () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";

		expect(() => session({ secret })).toThrow(
			"A distributed session store is required in production. Configure REDIS_URL environment variable or pass a custom store.",
		);

		process.env.NODE_ENV = originalEnv;
	});

	it("should initialize a new session and attach it to req.session", async () => {
		const store = new MemoryStore();
		const middleware = session({ secret, store });
		const { req, res, rawRes, headersMap } = createMockSessionContext();

		let executedSessionId = "";
		await middleware(req, res, async () => {
			expect(req.session).toBeDefined();
			expect(req.session.isNew).toBe(true);
			req.session.user = "Alice";
			executedSessionId = req.session.id;
			rawRes.end();
		});

		expect(headersMap["Set-Cookie"]).toContain("sid=");
		expect(headersMap["Set-Cookie"]).toContain(sign(executedSessionId, secret));

		const saved = await store.get(executedSessionId);
		expect(saved).toEqual({ user: "Alice" });

		await middleware.close();
	});

	it("should restore an existing session from signed cookie", async () => {
		const store = new MemoryStore();
		await store.set("existing-sid", { views: 5 }, 60000);

		const signed = sign("existing-sid", secret);
		const { req, res, rawRes } = createMockSessionContext(`sid=${signed}`);
		const middleware = session({ secret, store });

		await middleware(req, res, async () => {
			expect(req.session.isNew).toBe(false);
			expect(req.session.id).toBe("existing-sid");
			expect(req.session.views).toBe(5);

			req.session.views = 6;
			await req.session.save();
			rawRes.end();
		});

		expect(await store.get("existing-sid")).toEqual({ views: 6 });
		await middleware.close();
	});

	it("should re-generate session ID if signature is valid but store has no matching entry", async () => {
		const store = new MemoryStore();
		const signed = sign("evicted-sid", secret);
		const { req, res, rawRes } = createMockSessionContext(`sid=${signed}`);
		const middleware = session({ secret, store });

		await middleware(req, res, async () => {
			expect(req.session.isNew).toBe(true);
			expect(req.session.id).not.toBe("evicted-sid");
			rawRes.end();
		});

		await middleware.close();
	});

	it("should support resave and rolling options when session data did not change", async () => {
		const store = new MemoryStore();
		await store.set("rolling-sid", { user: "Bob" }, 60000);

		const signed = sign("rolling-sid", secret);
		const { req, res, rawRes, headersMap } = createMockSessionContext(
			`sid=${signed}`,
		);
		const middleware = session({
			secret,
			store,
			resave: true,
			rolling: true,
		});

		await middleware(req, res, async () => {
			rawRes.end();
		});

		expect(headersMap["Set-Cookie"]).toBeDefined();
		await middleware.close();
	});

	it("should work seamlessly when response has no raw.end method", async () => {
		const store = new MemoryStore();
		const middleware = session({ secret, store, saveUninitialized: true });
		const reqRaw = new IncomingMessage(new Socket());
		const req = { raw: reqRaw } as IRequest;
		const res = {
			raw: {},
			setHeader: vi.fn(),
		} as unknown as IResponse;

		await middleware(req, res, async () => {
			req.session.data = "saved";
		});

		expect(res.setHeader).toHaveBeenCalledWith(
			"Set-Cookie",
			expect.stringContaining("sid="),
		);
		await middleware.close();
	});

	it("should regenerate session ID and destroy previous state on regenerate()", async () => {
		const store = new MemoryStore();
		await store.set("old-sid", { loggedIn: true }, 60000);

		const signed = sign("old-sid", secret);
		const { req, res, rawRes } = createMockSessionContext(`sid=${signed}`);
		const middleware = session({ secret, store });

		await middleware(req, res, async () => {
			await req.session.regenerate();
			expect(req.session.id).not.toBe("old-sid");
			expect(req.session.isNew).toBe(true);
			rawRes.end();
		});

		expect(await store.get("old-sid")).toBeNull();
		await middleware.close();
	});

	it("should destroy session and clear cookie on destroy()", async () => {
		const store = new MemoryStore();
		await store.set("to-destroy", { temp: true }, 60000);

		const signed = sign("to-destroy", secret);
		const { req, res, rawRes, headersMap } = createMockSessionContext(
			`sid=${signed}`,
		);
		const middleware = session({ secret, store });

		await middleware(req, res, async () => {
			await req.session.destroy();
			rawRes.end();
		});

		expect(await store.get("to-destroy")).toBeNull();
		expect(headersMap["Set-Cookie"]).toContain("Max-Age=0");
		await middleware.close();
	});

	it("should replace a corrupted signed cookie without reading from the store", async () => {
		const store = new MemoryStore();
		const getSpy = vi.spyOn(store, "get");
		const { req, res, rawRes } = createMockSessionContext(
			"sid=corrupted.payload",
		);
		const middleware = session({
			secret,
			store,
			genid: () => "replacement-id",
		});

		await middleware(req, res, async () => {
			expect(req.session.id).toBe("replacement-id");
			expect(req.session.isNew).toBe(true);
			rawRes.end();
		});

		expect(getSpy).not.toHaveBeenCalled();
		await middleware.close();
	});

	it("should log a store persistence timeout while still ending the response", async () => {
		const store: ISessionStore = {
			get: async () => null,
			set: async () => {
				throw new Error("Redis session operation timed out.");
			},
			destroy: async () => undefined,
		};
		const consoleSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const { req, res, rawRes } = createMockSessionContext();
		const middleware = session({ secret, store, saveUninitialized: true });

		await middleware(req, res, async () => {
			rawRes.end();
		});
		await new Promise<void>((resolve) => setImmediate(resolve));

		expect(rawRes.end).toHaveBeenCalledOnce();
		expect(consoleSpy).toHaveBeenCalledWith(
			"[session] failed to persist session:",
			expect.objectContaining({
				message: "Redis session operation timed out.",
			}),
		);
		await middleware.close();
	});

	it("should restore the original response end method after finalization", async () => {
		const store = new MemoryStore();
		const { req, res, rawRes } = createMockSessionContext();
		const originalEnd = rawRes.end;
		const middleware = session({ secret, store });

		await middleware(req, res, async () => undefined);

		expect(rawRes.end).toBe(originalEnd);
		await middleware.close();
	});

	it("should surface the Redis client import fallback when production configuration supplies REDIS_URL", () => {
		const nodeEnvironment = process.env.NODE_ENV;
		const redisUrl = process.env.REDIS_URL;
		process.env.NODE_ENV = "production";
		process.env.REDIS_URL = "redis://127.0.0.1:6379";

		try {
			const createMiddleware = () => session({ secret });
			expect(createMiddleware).toThrow("Failed to import Redis client");
		} finally {
			if (nodeEnvironment === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = nodeEnvironment;
			if (redisUrl === undefined) delete process.env.REDIS_URL;
			else process.env.REDIS_URL = redisUrl;
		}
	});
});