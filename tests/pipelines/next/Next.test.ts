import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Next } from "../../../packages/pipelines/next/Next.js";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";
import type { IHandler } from "../../../packages/core/router/types/router.types.js";

describe("Next", () => {
	let mockReq: IRequest;
	let mockRes: IResponse;

	beforeEach(() => {
		mockReq = {} as IRequest;
		mockRes = {
			writableEnded: false,
		} as unknown as IResponse;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("run & execution flow", () => {
		it("should execute handlers sequentially in the registered order", async () => {
			const executionOrder: number[] = [];

			const handler1: IHandler = vi.fn((_req, _res, next) => {
				executionOrder.push(1);
				return next();
			});

			const handler2: IHandler = vi.fn(async (_req, _res, next) => {
				executionOrder.push(2);
				await next();
			});

			const handler3: IHandler = vi.fn((_req, _res, next) => {
				executionOrder.push(3);
				return next();
			});

			const pipeline = new Next([handler1, handler2, handler3], mockReq, mockRes);
			await pipeline.run();

			expect(executionOrder).toEqual([1, 2, 3]);
			expect(handler1).toHaveBeenCalledWith(mockReq, mockRes, pipeline.next);
			expect(handler2).toHaveBeenCalledWith(mockReq, mockRes, pipeline.next);
			expect(handler3).toHaveBeenCalledWith(mockReq, mockRes, pipeline.next);
		});

		it("should resolve cleanly when handlers array is empty", async () => {
			const pipeline = new Next([], mockReq, mockRes);
			await expect(pipeline.run()).resolves.toBeUndefined();
		});

		it("should skip undefined slots in sparse handler arrays", async () => {
			const executed: number[] = [];
			const handler1: IHandler = vi.fn((_req, _res, next) => {
				executed.push(1);
				return next();
			});
			const handler2: IHandler = vi.fn((_req, _res, next) => {
				executed.push(2);
				return next();
			});

			const sparseHandlers = [
				handler1,
				undefined as unknown as IHandler,
				handler2,
			];

			const pipeline = new Next(sparseHandlers, mockReq, mockRes);
			await pipeline.run();

			expect(executed).toEqual([1, 2]);
			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(1);
		});

		it("should halt execution immediately if res.writableEnded is true before starting", async () => {
			const handler = vi.fn((_req, _res, next) => next());
			(mockRes as { writableEnded: boolean }).writableEnded = true;

			const pipeline = new Next([handler], mockReq, mockRes);
			await pipeline.run();

			expect(handler).not.toHaveBeenCalled();
		});

		it("should halt execution mid-pipeline if a handler finishes the response", async () => {
			const handler1: IHandler = vi.fn((_req, res, next) => {
				(res as { writableEnded: boolean }).writableEnded = true;
				return next();
			});
			const handler2: IHandler = vi.fn((_req, _res, next) => next());

			const pipeline = new Next([handler1, handler2], mockReq, mockRes);
			await pipeline.run();

			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).not.toHaveBeenCalled();
		});

		it("should maintain binding when next function is detached and passed around", async () => {
			let detachedNextRef: ((err?: unknown) => void | Promise<void>) | undefined;

			const handler1: IHandler = vi.fn((_req, _res, next) => {
				detachedNextRef = next;
			});
			const handler2: IHandler = vi.fn();

			const pipeline = new Next([handler1, handler2], mockReq, mockRes);
			await pipeline.run();

			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).not.toHaveBeenCalled();

			if (detachedNextRef) {
				await detachedNextRef();
			}

			expect(handler2).toHaveBeenCalledTimes(1);
		});
	});

	describe("error handling", () => {
		it("should propagate error when next is invoked with an error argument", async () => {
			const customError = new Error("Custom middleware error");
			const handler1: IHandler = vi.fn((_req, _res, next) => next(customError));
			const handler2: IHandler = vi.fn();

			const pipeline = new Next([handler1, handler2], mockReq, mockRes);

			await expect(pipeline.run()).rejects.toThrow("Custom middleware error");
			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).not.toHaveBeenCalled();
		});

		it("should propagate synchronous errors thrown inside a handler", async () => {
			const syncError = new Error("Sync failure");
			const handler1: IHandler = vi.fn(() => {
				throw syncError;
			});
			const handler2: IHandler = vi.fn();

			const pipeline = new Next([handler1, handler2], mockReq, mockRes);

			await expect(pipeline.run()).rejects.toThrow("Sync failure");
			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).not.toHaveBeenCalled();
		});

		it("should propagate asynchronous rejections thrown inside an async handler", async () => {
			const asyncError = new Error("Async failure");
			const handler1: IHandler = vi.fn(async () => {
				throw asyncError;
			});
			const handler2: IHandler = vi.fn();

			const pipeline = new Next([handler1, handler2], mockReq, mockRes);

			await expect(pipeline.run()).rejects.toThrow("Async failure");
			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).not.toHaveBeenCalled();
		});
	});

	describe("defensive settlement guards", () => {
		it("should warn and ignore when next is called after the pipeline has settled via completion", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			let duplicateNextCaller!: () => Promise<void>;
			const handler: IHandler = vi.fn(async (_req, _res, next) => {
				duplicateNextCaller = async () => {
					await next();
				};
				await next();
			});

			const pipeline = new Next([handler], mockReq, mockRes);
			await pipeline.run();

			expect(warnSpy).not.toHaveBeenCalled();

			await duplicateNextCaller();

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(
				"[Subatom Warning]: next() was called after the request pipeline already settled; ignoring.",
			);
		});

		it("should warn and ignore when next is called after the pipeline has settled via error", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			let capturedNext!: (err?: unknown) => Promise<void>;
			const handler: IHandler = vi.fn((_req, _res, next) => {
				capturedNext = next as (err?: unknown) => Promise<void>;
				throw new Error("Initial failure");
			});

			const pipeline = new Next([handler], mockReq, mockRes);

			await expect(pipeline.run()).rejects.toThrow("Initial failure");

			await capturedNext();

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(
				"[Subatom Warning]: next() was called after the request pipeline already settled; ignoring.",
			);
		});

		it("should warn and ignore when next is called with an error after pipeline already settled", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			let capturedNext!: (err?: unknown) => Promise<void>;
			const handler: IHandler = vi.fn(async (_req, _res, next) => {
				capturedNext = next as (err?: unknown) => Promise<void>;
				await next();
			});

			const pipeline = new Next([handler], mockReq, mockRes);
			await pipeline.run();

			await capturedNext(new Error("Late error"));

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(
				"[Subatom Warning]: next() was called after the request pipeline already settled; ignoring.",
			);
		});
	});
});