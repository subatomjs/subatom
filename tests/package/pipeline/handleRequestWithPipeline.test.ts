import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorFormatter } from "../../../package/core/http/errors/errorFormatter.js";
import { handleRequestWithPipeline } from "../../../package/core/pipeline/modifier/RouterPipelineAdapter.js";

describe("handleRequestWithPipeline", () => {
	let router: any;
	let req: any;
	let res: any;
	let appConfig: any;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(ErrorFormatter, "handle").mockImplementation(() => {});

		req = {
			url: "/users?page=1",
			method: "GET",
		};

		res = {
			writableEnded: false,
			json: vi.fn(() => {
				res.writableEnded = true;
			}),
			send: vi.fn(() => {
				res.writableEnded = true;
			}),
		};

		appConfig = {
			transformers: [],
			interceptors: [],
			serializers: [],
		};

		router = {
			match: vi.fn().mockReturnValue({
				route: { routerPipeline: undefined },
			}),
			dispatch: vi.fn(),
		};
	});

	it("handles standard controller execution that calls res.json()", async () => {
		router.dispatch.mockImplementation(async (_req: any, capturedRes: any) => {
			capturedRes.json({ success: true });
		});

		await handleRequestWithPipeline(router, req, res, appConfig);

		expect(res.json).toHaveBeenCalledWith({ success: true });
	});

	it("handles controller returning direct value without calling terminal response method", async () => {
		router.dispatch.mockResolvedValue({ data: "direct return" });

		await handleRequestWithPipeline(router, req, res, appConfig);

		expect(res.json).toHaveBeenCalledWith({ data: "direct return" });
	});

	it("delegates to ErrorFormatter.handle when dispatch throws", async () => {
		const error = new Error("Route unhandled failure");
		router.dispatch.mockRejectedValue(error);

		await handleRequestWithPipeline(router, req, res, appConfig);

		expect(ErrorFormatter.handle).toHaveBeenCalledWith(
			expect.anything(),
			req,
			res,
		);
	});

	it("logs error without formatting if response writableEnded is already true when error triggers", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		res.writableEnded = true;

		router.dispatch.mockRejectedValue(new Error("Late error"));

		await handleRequestWithPipeline(router, req, res, appConfig);

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"Unhandled error occurred after response was already sent",
			),
			expect.any(Error),
		);
		expect(ErrorFormatter.handle).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});
});
