import { describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import type { IRequestContext } from "../../../../../packages/core/server/types/subatom.server.types.js";
import type { IRequest } from "../../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../../packages/core/http/response/types/response.types.js";
import type { ErrorMiddlewareHandler } from "../../../../../packages/pipelines/pipeline.types.js";
import * as errorPipelineService from "../../../../../packages/core/server/services/errorPipeline.service.js";
import { tryRecoverFromOrphanedRejection } from "../../../../../packages/core/server/services/orphanRecovery.service.js";

describe("orphanRecovery.service", () => {
	it("should return false when no store is present in AsyncLocalStorage", () => {
		const als = new AsyncLocalStorage<IRequestContext>();
		const result = tryRecoverFromOrphanedRejection(als, [], new Error("test"));
		expect(result).toBe(false);
	});

	it("should return false if res.writableEnded is true", () => {
		const als = new AsyncLocalStorage<IRequestContext>();
		const mockReq = {} as IRequest;
		const mockRes = { writableEnded: true, headersSent: false } as unknown as IResponse;

		const result = als.run({ req: mockReq, res: mockRes }, () => {
			return tryRecoverFromOrphanedRejection(als, [], new Error("test"));
		});

		expect(result).toBe(false);
	});

	it("should return false if res.headersSent is true", () => {
		const als = new AsyncLocalStorage<IRequestContext>();
		const mockReq = {} as IRequest;
		const mockRes = { writableEnded: false, headersSent: true } as unknown as IResponse;

		const result = als.run({ req: mockReq, res: mockRes }, () => {
			return tryRecoverFromOrphanedRejection(als, [], new Error("test"));
		});

		expect(result).toBe(false);
	});

	it("should route to handleErrorPipeline and return true when response is still writable", () => {
		const als = new AsyncLocalStorage<IRequestContext>();
		const mockReq = {} as IRequest;
		const mockRes = { writableEnded: false, headersSent: false } as unknown as IResponse;
		const errorMiddlewares: ErrorMiddlewareHandler[] = [];
		const error = new Error("async failure");

		const handlePipelineSpy = vi
			.spyOn(errorPipelineService, "handleErrorPipeline")
			.mockResolvedValue();
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = als.run({ req: mockReq, res: mockRes }, () => {
			return tryRecoverFromOrphanedRejection(als, errorMiddlewares, error);
		});

		expect(result).toBe(true);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining("Recovered an orphaned promise rejection"),
		);
		expect(handlePipelineSpy).toHaveBeenCalledWith(
			error,
			mockReq,
			mockRes,
			errorMiddlewares,
		);
	});
});