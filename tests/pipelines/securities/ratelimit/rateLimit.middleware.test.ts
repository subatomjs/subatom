import { describe, expect, it, vi } from "vitest";
import { createRateLimitMiddleware } from "../../../../packages/pipelines/securities/ratelimit/rateLimit.middleware.js";
import type { IRequest } from "../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../packages/core/http/response/types/response.types.js";
import type { RateLimitStore } from "../../../../packages/pipelines/securities/ratelimit/types/rateLimit.types.js";

describe("createRateLimitMiddleware", () => {
	const createMockReq = (): IRequest =>
		({
			ip: "127.0.0.1",
			headers: {},
			raw: { socket: { remoteAddress: "127.0.0.1" } },
		}) as unknown as IRequest;

	const createMockRes = () => {
		const res = {
			headersSent: false,
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
			end: vi.fn().mockReturnThis(),
		};
		return res as unknown as IResponse & typeof res;
	};

	it("should allow request and invoke next() when within rate limits", async () => {
		const middleware = createRateLimitMiddleware({
			limit: 10,
			window: "1m",
		});

		const req = createMockReq();
		const res = createMockRes();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(res.status).not.toHaveBeenCalled();
		expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Limit", 10);
	});

	it("should block request and respond with 429 when rate limit is exceeded", async () => {
		const onLimitExceeded = vi.fn();
		const middleware = createRateLimitMiddleware({
			limit: 1,
			window: "1m",
			onLimitExceeded,
		});

		const req = createMockReq();
		const res1 = createMockRes();
		const res2 = createMockRes();
		const next = vi.fn();

		// Request 1: allowed
		await middleware(req, res1, next);
		expect(next).toHaveBeenCalledTimes(1);

		// Request 2: exceeded
		await middleware(req, res2, next);
		expect(next).toHaveBeenCalledTimes(1); // not called again
		expect(onLimitExceeded).toHaveBeenCalledWith(
			req,
			res2,
			expect.objectContaining({ allowed: false }),
		);
		expect(res2.status).toHaveBeenCalledWith(429);
		expect(res2.json).toHaveBeenCalledWith({
			error: "Too Many Requests",
			retryAfterMs: expect.any(Number),
		});
	});

	it("should call res.end() when limit exceeded if res.status is not available", async () => {
		const middleware = createRateLimitMiddleware({
			limit: 0, // Forces immediate block via config validation bypass or single hit
			policies: [{ limit: 1, window: "1m" }],
		});

		const req = createMockReq();
		const resWithoutStatus = {
			headersSent: false,
			setHeader: vi.fn(),
			end: vi.fn(),
		} as unknown as IResponse;
		const next = vi.fn();

		// First consumes limit
		await middleware(req, createMockRes(), next);
		// Second should block and trigger res.end()
		await middleware(req, resWithoutStatus, next);

		expect(resWithoutStatus.end).toHaveBeenCalledTimes(1);
	});

	describe("store failure handling", () => {
		it("should fail-open and invoke next() when store throws in fail-open mode", async () => {
			const failingStore: RateLimitStore = {
				evaluate: vi.fn().mockRejectedValue(new Error("Store down")),
			};

			const onStoreError = vi.fn();
			const middleware = createRateLimitMiddleware({
				limit: 10,
				store: failingStore,
				failureMode: "fail-open",
				onStoreError,
			});

			const req = createMockReq();
			const res = createMockRes();
			const next = vi.fn();

			await middleware(req, res, next);

			expect(onStoreError).toHaveBeenCalledWith(expect.any(Error), req);
			expect(next).toHaveBeenCalledTimes(1);
			expect(res.status).not.toHaveBeenCalled();
		});

		it("should fail-closed and return 500 when store throws in fail-closed mode", async () => {
			const failingStore: RateLimitStore = {
				evaluate: vi.fn().mockRejectedValue(new Error("Store down")),
			};

			const middleware = createRateLimitMiddleware({
				limit: 10,
				store: failingStore,
				failureMode: "fail-closed",
			});

			const req = createMockReq();
			const res = createMockRes();
			const next = vi.fn();

			await middleware(req, res, next);

			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: "Rate Limiter Failure" });
		});

		it("should gracefully catch errors thrown inside onStoreError callback", async () => {
			const failingStore: RateLimitStore = {
				evaluate: vi.fn().mockRejectedValue(new Error("DB error")),
			};

			const middleware = createRateLimitMiddleware({
				limit: 10,
				store: failingStore,
				failureMode: "fail-open",
				onStoreError: () => {
					throw new Error("Telemetry crashed");
				},
			});

			const req = createMockReq();
			const res = createMockRes();
			const next = vi.fn();

			await expect(middleware(req, res, next)).resolves.not.toThrow();
			expect(next).toHaveBeenCalledTimes(1);
		});
	});

	it("should delegate close and destroy lifecycles to the underlying engine", async () => {
		const mockStore: RateLimitStore = {
			evaluate: vi.fn(),
			close: vi.fn(),
			destroy: vi.fn(),
		};

		const middleware = createRateLimitMiddleware({
			limit: 10,
			store: mockStore,
		});

		await middleware.close();
		expect(mockStore.close).toHaveBeenCalledTimes(1);

		await middleware.destroy();
		expect(mockStore.destroy).toHaveBeenCalledTimes(1);
	});
});