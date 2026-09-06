import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IRequest } from "../../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../../packages/core/http/response/types/response.types.js";
import type { ErrorMiddlewareHandler } from "../../../../../packages/pipelines/pipeline.types.js";
import { ErrorFormatter } from "../../../../../packages/errors/ErrorFormatter.js";
import { handleErrorPipeline } from "../../../../../packages/core/server/services/errorPipeline.service.js";

vi.mock("../../../../../packages/errors/ErrorFormatter.js", () => ({
	ErrorFormatter: {
		handle: vi.fn(),
	},
}));

describe("errorPipeline.service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should early return without calling middlewares if res.writableEnded is true", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const mockReq = { get: vi.fn() } as unknown as IRequest;
		const mockRes = { writableEnded: true } as unknown as IResponse;
		const middleware = vi.fn();

		await handleErrorPipeline(new Error("late error"), mockReq, mockRes, [middleware]);

		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining("[SubatomServer Warning]: Error occurred after response was sent:"),
			expect.any(Error),
		);
		expect(middleware).not.toHaveBeenCalled();
		expect(ErrorFormatter.handle).not.toHaveBeenCalled();
	});

	it("should invoke ErrorFormatter directly when no error middlewares are provided", async () => {
		const mockReq = { get: vi.fn() } as unknown as IRequest;
		const mockRes = { writableEnded: false } as unknown as IResponse;
		const error = new Error("Uncaught boom");

		await handleErrorPipeline(error, mockReq, mockRes, []);

		expect(ErrorFormatter.handle).toHaveBeenCalledTimes(1);
		expect(ErrorFormatter.handle).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Uncaught boom" }),
			mockReq,
			mockRes,
		);
	});

	it("should traverse multiple error middlewares via next and hit ErrorFormatter at end", async () => {
		const mockReq = { get: vi.fn() } as unknown as IRequest;
		const mockRes = { writableEnded: false } as unknown as IResponse;
		const err = new Error("Original Error");
		const callOrder: string[] = [];

		const m1: ErrorMiddlewareHandler = vi.fn(async (_err, _q, _s, next) => {
			callOrder.push("m1");
			await next();
		});
		const m2: ErrorMiddlewareHandler = vi.fn(async (_err, _q, _s, next) => {
			callOrder.push("m2");
			await next();
		});

		await handleErrorPipeline(err, mockReq, mockRes, [m1, m2]);

		expect(callOrder).toEqual(["m1", "m2"]);
		expect(ErrorFormatter.handle).toHaveBeenCalledTimes(1);
	});

	it("should skip undefined slots in errorMiddlewares array", async () => {
		const mockReq = { get: vi.fn() } as unknown as IRequest;
		const mockRes = { writableEnded: false } as unknown as IResponse;
		const m1: ErrorMiddlewareHandler = vi.fn(async (_err, _q, _s, next) => {
			await next();
		});
		const sparseMiddlewares = [
			m1,
			undefined as unknown as ErrorMiddlewareHandler,
		];

		await handleErrorPipeline(new Error("sparse"), mockReq, mockRes, sparseMiddlewares);

		expect(m1).toHaveBeenCalledTimes(1);
		expect(ErrorFormatter.handle).toHaveBeenCalledTimes(1);
	});

	it("should forward caught error to next handler if middleware throws", async () => {
		const mockReq = { get: vi.fn() } as unknown as IRequest;
		const mockRes = { writableEnded: false } as unknown as IResponse;
		const originalError = new Error("Original");
		const thrownError = new Error("Thrown from m1");

		const m1: ErrorMiddlewareHandler = vi.fn(async () => {
			throw thrownError;
		});
		const m2: ErrorMiddlewareHandler = vi.fn(async (err, _q, _s, next) => {
			expect(err).toBe(thrownError);
			await next(err);
		});

		await handleErrorPipeline(originalError, mockReq, mockRes, [m1, m2]);

		expect(m1).toHaveBeenCalledTimes(1);
		expect(m2).toHaveBeenCalledTimes(1);
		expect(ErrorFormatter.handle).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Thrown from m1" }),
			mockReq,
			mockRes,
		);
	});
});