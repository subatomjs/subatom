import { describe, it, expect, vi } from "vitest";
import normalizeMiddlewareToHandler from "../../../../../packages/core/router/helpers/normalizeMiddleware.js";
import type { IRequest } from "../../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../../packages/core/http/response/types/response.types.js";
import type {
	IContextMiddleware,
	ILegacyHandler,
} from "../../../../../packages/core/router/types/router.types.js";

describe("normalizeMiddlewareToHandler", () => {
	const req = { raw: {} } as IRequest;
	const res = { raw: {}, writableEnded: false } as IResponse;
	const next = vi.fn();

	it("should execute legacy middleware having arity >= 3", async () => {
		const legacyMw: ILegacyHandler = vi.fn((_req, _res, n) => n());
		const handler = normalizeMiddlewareToHandler(legacyMw);

		await handler(req, res, next);
		expect(legacyMw).toHaveBeenCalledWith(req, res, next);
	});

	it("should execute middleware with _fileConfig property as legacy handler", async () => {
		const fileMw = Object.assign(
			vi.fn((_req: IRequest, _res: IResponse, n: () => void) => n()),
			{ _fileConfig: {} },
		);

		const handler = normalizeMiddlewareToHandler(
			fileMw as unknown as ILegacyHandler,
		);
		await handler(req, res, next);
		expect(fileMw).toHaveBeenCalledWith(req, res, next);
	});

	it("should execute context-based middleware passing created Context", async () => {
		const contextMw: IContextMiddleware = vi.fn((_ctx, n) => n());
		const handler = normalizeMiddlewareToHandler(contextMw);

		await handler(req, res, next);
		expect(contextMw).toHaveBeenCalled();
	});
});
