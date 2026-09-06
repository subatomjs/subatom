import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCors } from "../../../../packages/pipelines/securities/cors/corsMiddleware.js";
import type { IRequest } from "../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../packages/core/http/response/types/response.types.js";
import type { NextFunction } from "../../../../packages/pipelines/next/types/nextFunction.types.js";

describe("createCors", () => {
	let mockReq: IRequest;
	let mockRes: IResponse;
	let next: NextFunction;

	beforeEach(() => {
		mockReq = {
			raw: {
				headers: {
					origin: "https://subatomjs.dev",
				},
				method: "GET",
			},
		} as unknown as IRequest;

		mockRes = {
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			end: vi.fn().mockReturnThis(),
			vary: vi.fn(),
		} as unknown as IResponse;

		next = vi.fn();
	});

	it("should set vary Origin and pass through if requestOrigin is missing", async () => {
		mockReq = {
			raw: {
				headers: {},
				method: "GET",
			},
		} as unknown as IRequest;

		const cors = createCors();
		await cors(mockReq, mockRes, next);

		expect(mockRes.vary).not.toHaveBeenCalled();
		expect(mockRes.setHeader).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should pick first origin when raw header is an array", async () => {
		mockReq = {
			raw: {
				headers: {
					origin: ["https://first.com", "https://second.com"],
				},
				method: "GET",
			},
		} as unknown as IRequest;

		const cors = createCors({ origin: "https://first.com" });
		await cors(mockReq, mockRes, next);

		expect(mockRes.vary).toHaveBeenCalledWith("Origin");
		expect(mockRes.setHeader).toHaveBeenCalledWith(
			"Access-Control-Allow-Origin",
			"https://first.com",
		);
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should read headers and method from fallback request object if raw is not present", async () => {
		mockReq = {
			headers: {
				origin: "https://fallback.com",
			},
			method: "POST",
		} as unknown as IRequest;

		const cors = createCors({ origin: "*" });
		await cors(mockReq, mockRes, next);

		expect(mockRes.vary).toHaveBeenCalledWith("Origin");
		expect(mockRes.setHeader).toHaveBeenCalledWith(
			"Access-Control-Allow-Origin",
			"*",
		);
		expect(next).toHaveBeenCalledTimes(1);
	});

	describe("origin and credentials negotiation", () => {
		it("should set Access-Control-Allow-Origin to wildcard '*' when credentials are false", async () => {
			const cors = createCors({ origin: "*", credentials: false });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Origin",
				"*",
			);
			expect(mockRes.setHeader).not.toHaveBeenCalledWith(
				"Access-Control-Allow-Credentials",
				expect.anything(),
			);
		});

		it("should reflect specific origin instead of '*' when credentials: true", async () => {
			const cors = createCors({ origin: "*", credentials: true });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Origin",
				"https://subatomjs.dev",
			);
			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Credentials",
				"true",
			);
		});

		it("should reflect origin when allowedOrigin evaluates to boolean true", async () => {
			const cors = createCors({ origin: true });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Origin",
				"https://subatomjs.dev",
			);
		});

		it("should set specific allowedOrigin string", async () => {
			const cors = createCors({ origin: "https://subatomjs.dev" });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Origin",
				"https://subatomjs.dev",
			);
		});

		it("should not set Access-Control-Allow-Origin when origin is denied", async () => {
			const cors = createCors({ origin: "https://other.com" });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).not.toHaveBeenCalledWith(
				"Access-Control-Allow-Origin",
				expect.anything(),
			);
			expect(next).toHaveBeenCalledTimes(1);
		});
	});

	describe("exposed headers", () => {
		it("should set Access-Control-Expose-Headers when configured", async () => {
			const cors = createCors({
				exposedHeaders: ["X-Custom-Header", "X-Trace-Id"],
			});
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Expose-Headers",
				"X-Custom-Header,X-Trace-Id",
			);
		});

		it("should not set Access-Control-Expose-Headers if empty", async () => {
			const cors = createCors({ exposedHeaders: [] });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).not.toHaveBeenCalledWith(
				"Access-Control-Expose-Headers",
				expect.anything(),
			);
		});
	});

	describe("preflight OPTIONS handling", () => {
		beforeEach(() => {
			(mockReq.raw as { method: string }).method = "OPTIONS";
		});

		it("should apply preflight headers and respond with 204 status by default", async () => {
			const cors = createCors();
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Methods",
				"GET,HEAD,PUT,PATCH,POST,DELETE",
			);
			expect(mockRes.status).toHaveBeenCalledWith(204);
			expect(mockRes.end).toHaveBeenCalledTimes(1);
			expect(next).not.toHaveBeenCalled();
		});

		it("should use custom optionsSuccessStatus when configured", async () => {
			const cors = createCors({ optionsSuccessStatus: 200 });
			await cors(mockReq, mockRes, next);

			expect(mockRes.status).toHaveBeenCalledWith(200);
			expect(mockRes.end).toHaveBeenCalledTimes(1);
		});

		it("should forward preflight to next() when preflightContinue is true", async () => {
			const cors = createCors({ preflightContinue: true });
			await cors(mockReq, mockRes, next);

			expect(mockRes.status).not.toHaveBeenCalled();
			expect(mockRes.end).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledTimes(1);
		});

		it("should set configured allowedHeaders", async () => {
			const cors = createCors({
				allowedHeaders: ["Content-Type", "Authorization"],
			});
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Headers",
				"Content-Type,Authorization",
			);
		});

		it("should reflect Access-Control-Request-Headers when no explicit allowedHeaders set", async () => {
			mockReq.raw!.headers!["access-control-request-headers"] =
				"X-Custom-Token, Accept";

			const cors = createCors({ allowedHeaders: [] });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Headers",
				"X-Custom-Token, Accept",
			);
			expect(mockRes.vary).toHaveBeenCalledWith("Access-Control-Request-Headers");
		});

		it("should reflect array-based Access-Control-Request-Headers properly", async () => {
			mockReq.raw!.headers!["access-control-request-headers"] = [
				"X-One",
				"X-Two",
			] as unknown as string;

			const cors = createCors({ allowedHeaders: [] });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Allow-Headers",
				"X-One, X-Two",
			);
		});

		it("should set Access-Control-Max-Age when maxAge is a non-negative number", async () => {
			const cors = createCors({ maxAge: 86400 });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).toHaveBeenCalledWith(
				"Access-Control-Max-Age",
				"86400",
			);
		});

		it("should not set Access-Control-Max-Age when maxAge is negative or non-number", async () => {
			const cors = createCors({ maxAge: -1 });
			await cors(mockReq, mockRes, next);

			expect(mockRes.setHeader).not.toHaveBeenCalledWith(
				"Access-Control-Max-Age",
				expect.anything(),
			);
		});
	});
});