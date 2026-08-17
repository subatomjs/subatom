import { describe, expect, it, vi } from "vitest";
import {
	createResponseCapture,
	flushCapturedResponse,
} from "../../../package/core/pipeline/modifier/services/responseCapture.service.js";

describe("responseCapture", () => {
	it("proxies method chaining correctly (e.g. res.status().header())", () => {
		const realRes: any = {
			status: vi.fn().mockReturnThis(),
			setHeader: vi.fn().mockReturnThis(),
			json: vi.fn(),
		};

		const { res: proxyRes } = createResponseCapture(realRes);
		const chained = proxyRes.status(200);

		expect(chained).toBe(proxyRes);
		expect(realRes.status).toHaveBeenCalledWith(200);
	});

	it("captures terminal method call (json) and resolves promise", async () => {
		const realRes: any = { json: vi.fn() };
		const { res: proxyRes, captured } = createResponseCapture(realRes);

		proxyRes.json({ success: true });
		const result = await captured;

		expect(result).toEqual({
			method: "json",
			args: [{ success: true }],
		});
	});

	it("throws if terminal method is called a second time", () => {
		const realRes: any = { json: vi.fn() };
		const { res: proxyRes } = createResponseCapture(realRes);

		proxyRes.json({ first: true });
		expect(() => {
			proxyRes.json({ second: true });
		}).toThrow('Response already sent — "json" was called a second time.');
	});

	it("flushes captured call to the real response", () => {
		const realRes: any = {
			json: vi.fn(),
		};

		flushCapturedResponse(realRes, "json", [{ data: 123 }]);
		expect(realRes.json).toHaveBeenCalledWith({ data: 123 });
	});

	it("throws if flushing an unrecognised method on real response", () => {
		const realRes: any = {};
		expect(() => {
			flushCapturedResponse(realRes, "nonExistent", []);
		}).toThrow(
			'Cannot flush response: "nonExistent" is not a function on IResponse.',
		);
	});
});
