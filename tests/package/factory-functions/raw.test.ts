import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { raw } from "../../../package/core/factory-functions/raw.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

function createMockRequest(options: {
	headers?: Record<string, string>;
	bodyChunks?: Buffer[];
}): IRequest {
	const rawStream = Readable.from(options.bodyChunks ?? []) as any;
	rawStream.headers = options.headers ?? {};

	return {
		raw: rawStream,
		body: undefined,
	} as unknown as IRequest;
}

function createMockResponse() {
	let statusCode = 200;
	let jsonBody: any = null;

	const res = {
		status(code: number) {
			statusCode = code;
			return this;
		},
		json(data: any) {
			jsonBody = data;
			return this;
		},
	} as unknown as IResponse;

	return {
		res,
		getStatus: () => statusCode,
		getJson: () => jsonBody,
	};
}

describe("Raw Body Parser Middleware", () => {
	it("should set empty Buffer and pass next if content-type does not match default octet-stream", async () => {
		const middleware = raw();
		const req = createMockRequest({
			headers: { "content-type": "application/json", "content-length": "10" },
		});
		const { res } = createMockResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(req.body).toEqual(Buffer.alloc(0));
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should parse raw binary payload into req.body as Buffer", async () => {
		const middleware = raw();
		const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
		const req = createMockRequest({
			headers: {
				"content-type": "application/octet-stream",
				"content-length": bytes.length.toString(),
			},
			bodyChunks: [bytes],
		});
		const { res } = createMockResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(Buffer.isBuffer(req.body)).toBe(true);
		expect(req.body).toEqual(bytes);
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should support array of accepted content-types", async () => {
		const middleware = raw({
			type: ["application/custom-bin", "application/zip"],
		});
		const binary = Buffer.from("zip-binary-data");
		const req = createMockRequest({
			headers: {
				"content-type": "application/zip",
				"content-length": binary.length.toString(),
			},
			bodyChunks: [binary],
		});
		const { res } = createMockResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(req.body).toEqual(binary);
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should reject payload exceeding byte limit", async () => {
		const middleware = raw({ limit: "5b" });
		const req = createMockRequest({
			headers: {
				"content-type": "application/octet-stream",
				"content-length": "100",
			},
		});
		const { res, getStatus, getJson } = createMockResponse();
		const next = vi.fn();

		await middleware(req, res, next);

		expect(getStatus()).toBe(413);
		expect(getJson()).toEqual({ success: false, message: "Payload Too Large" });
		expect(next).not.toHaveBeenCalled();
	});
});
