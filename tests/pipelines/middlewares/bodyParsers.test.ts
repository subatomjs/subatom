/// <reference types="node" />

import { describe, it, expect, vi, beforeEach } from "vitest";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { json } from "../../../packages/pipelines/middlewares/json.js";
import { raw } from "../../../packages/pipelines/middlewares/raw.js";
import { text } from "../../../packages/pipelines/middlewares/text.js";
import { urlencoded } from "../../../packages/pipelines/middlewares/urlencoded.js";
import { xml } from "../../../packages/pipelines/middlewares/xml.js";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";

function createMockRequestResponse(options: {
	headers?: Record<string, string>;
	bodyPayload?: string | Buffer | (string | Buffer)[];
	existingBody?: unknown;
}) {
	const socket = new Socket();
	const reqRaw = new IncomingMessage(socket);
	reqRaw.headers = options.headers ?? {};

	const req = {
		raw: reqRaw,
		headers: reqRaw.headers,
		body: options.existingBody,
	} as unknown as IRequest;

	const resHelper = {
		statusCode: 200,
		sentJson: undefined as unknown,
		status: vi.fn((code: number) => {
			resHelper.statusCode = code;
			return {
				json: vi.fn((payload: unknown) => {
					resHelper.sentJson = payload;
				}),
			};
		}),
	};

	const res = resHelper as unknown as IResponse;

	if (options.bodyPayload !== undefined) {
		process.nextTick(() => {
			if (Array.isArray(options.bodyPayload)) {
				for (const item of options.bodyPayload) {
					reqRaw.push(Buffer.isBuffer(item) ? item : Buffer.from(item));
				}
			} else {
				reqRaw.push(
					Buffer.isBuffer(options.bodyPayload)
						? options.bodyPayload
						: Buffer.from(options.bodyPayload ?? ""),
				);
			}
			reqRaw.push(null);
		});
	}

	return { req, res, resHelper };
}

describe("Body Parsing Middlewares", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("json()", () => {
		it("should skip parsing and set req.body = {} when content-type or body indicator is missing", async () => {
			const { req, res } = createMockRequestResponse({
				headers: { "content-type": "text/plain" },
			});
			const next = vi.fn();

			await json()(req, res, next);

			expect(req.body).toEqual({});
			expect(next).toHaveBeenCalled();
		});

		it("should skip parsing and set req.body = {} when hasBody is true but content-type is not JSON", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "text/plain",
					"content-length": "10",
				},
				bodyPayload: "hello plain",
			});
			const next = vi.fn();

			await json()(req, res, next);

			expect(req.body).toEqual({});
			expect(next).toHaveBeenCalled();
		});

		it("should parse valid JSON payload into JavaScript object", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/json",
					"content-length": "18",
				},
				bodyPayload: JSON.stringify({ name: "Subatom" }),
			});
			const next = vi.fn();

			await json()(req, res, next);

			expect(req.body).toEqual({ name: "Subatom" });
			expect(next).toHaveBeenCalled();
		});

		it("should assign empty object if JSON payload is empty string", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/json",
					"transfer-encoding": "chunked",
				},
				bodyPayload: "   ",
			});
			const next = vi.fn();

			await json()(req, res, next);

			expect(req.body).toEqual({});
			expect(next).toHaveBeenCalled();
		});

		it("should return 400 Bad Request when JSON is malformed", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/json",
					"content-length": "12",
				},
				bodyPayload: "{malformed:}",
			});
			const next = vi.fn();

			await json()(req, res, next);

			expect(resHelper.statusCode).toBe(400);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Bad Request: Invalid JSON Payload",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("should return 413 Payload Too Large when payload limit exceeded", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/json",
					"content-length": "500",
				},
				bodyPayload: JSON.stringify({ data: "x".repeat(300) }),
			});

			await json({ limit: "100b" })(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(413);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Payload Too Large",
			});
		});
	});

	describe("raw()", () => {
		it("should skip and assign empty Buffer if content-type does not match string", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "text/html",
					"content-length": "5",
				},
			});
			const next = vi.fn();

			await raw()(req, res, next);

			expect(req.body).toEqual(Buffer.alloc(0));
			expect(next).toHaveBeenCalled();
		});

		it("should skip and assign empty Buffer if content-type does not match array of types", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "text/html",
					"content-length": "5",
				},
			});
			const next = vi.fn();

			await raw({ type: ["application/pdf", "image/png"] })(req, res, next);

			expect(req.body).toEqual(Buffer.alloc(0));
			expect(next).toHaveBeenCalled();
		});

		it("should skip when body indicators are missing entirely", async () => {
			const { req, res } = createMockRequestResponse({
				headers: { "content-type": "application/octet-stream" },
			});
			const next = vi.fn();

			await raw()(req, res, next);

			expect(req.body).toEqual(Buffer.alloc(0));
			expect(next).toHaveBeenCalled();
		});

		it("should parse binary data to Buffer when matching single string type", async () => {
			const payload = Buffer.from([0x01, 0x02, 0x03]);
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/octet-stream",
					"content-length": "3",
				},
				bodyPayload: payload,
			});
			const next = vi.fn();

			await raw({ type: "application/octet-stream" })(req, res, next);

			expect(req.body).toEqual(payload);
			expect(next).toHaveBeenCalled();
		});

		it("should parse binary data to Buffer when matching type array", async () => {
			const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/octet-stream",
					"content-length": "4",
				},
				bodyPayload: payload,
			});
			const next = vi.fn();

			await raw({ type: ["application/octet-stream", "application/x-binary"] })(
				req,
				res,
				next,
			);

			expect(req.body).toEqual(payload);
			expect(next).toHaveBeenCalled();
		});

		it("should return 413 Payload Too Large when raw payload limit is exceeded", async () => {
			const payload = Buffer.alloc(200);
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/octet-stream",
					"content-length": "200",
				},
				bodyPayload: payload,
			});

			await raw({ limit: "100b" })(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(413);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Payload Too Large",
			});
		});

		it("should return 400 Bad Request when raw payload read fails with invalid Content-Length", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/octet-stream",
					"content-length": "invalid-length",
				},
			});

			await raw()(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(400);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Bad Request: Error reading raw payload",
			});
		});
	});

	describe("text()", () => {
		it("should skip and set req.body = '' when type does not match string", async () => {
			const { req, res } = createMockRequestResponse({
				headers: { "content-type": "application/json" },
			});
			const next = vi.fn();

			await text()(req, res, next);

			expect(req.body).toBe("");
			expect(next).toHaveBeenCalled();
		});

		it("should skip and set req.body = '' when type does not match array", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/json",
					"content-length": "10",
				},
			});
			const next = vi.fn();

			await text({ type: ["text/plain", "text/html"] })(req, res, next);

			expect(req.body).toBe("");
			expect(next).toHaveBeenCalled();
		});

		it("should skip when body indicators are missing entirely", async () => {
			const { req, res } = createMockRequestResponse({
				headers: { "content-type": "text/plain" },
			});
			const next = vi.fn();

			await text()(req, res, next);

			expect(req.body).toBe("");
			expect(next).toHaveBeenCalled();
		});

		it("should parse text payload using specified encoding and default type", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "text/plain",
					"content-length": "12",
				},
				bodyPayload: "hello subatom",
			});
			const next = vi.fn();

			await text({ defaultEncoding: "utf-8" })(req, res, next);

			expect(req.body).toBe("hello subatom");
			expect(next).toHaveBeenCalled();
		});

		it("should parse text payload matching array of types", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "text/csv",
					"content-length": "7",
				},
				bodyPayload: "a,b,c\n1",
			});
			const next = vi.fn();

			await text({ type: ["text/plain", "text/csv"] })(req, res, next);

			expect(req.body).toBe("a,b,c\n1");
			expect(next).toHaveBeenCalled();
		});

		it("should return 413 Payload Too Large when text limit is exceeded", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "text/plain",
					"content-length": "300",
				},
				bodyPayload: "a".repeat(300),
			});

			await text({ limit: "50b" })(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(413);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Payload Too Large",
			});
		});

		it("should return 400 Bad Request when text payload read fails with invalid length", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "text/plain",
					"content-length": "bad-length",
				},
			});

			await text()(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(400);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Bad Request: Error reading text payload",
			});
		});
	});

	describe("urlencoded()", () => {
		it("should skip when content-type is not application/x-www-form-urlencoded", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "multipart/form-data",
					"content-length": "20",
				},
			});
			const next = vi.fn();

			await urlencoded()(req, res, next);

			expect(next).toHaveBeenCalled();
		});

		it("should skip when body indicators are missing entirely", async () => {
			const { req, res } = createMockRequestResponse({
				headers: { "content-type": "application/x-www-form-urlencoded" },
			});
			const next = vi.fn();

			await urlencoded()(req, res, next);

			expect(next).toHaveBeenCalled();
		});

		it("should parse urlencoded keys and aggregate arrays into req.body", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"content-length": "37",
				},
				bodyPayload: "user=John&roles=admin&roles=developer",
			});
			const next = vi.fn();

			await urlencoded()(req, res, next);

			expect(req.body).toEqual({
				user: "John",
				roles: ["admin", "developer"],
			});
			expect(next).toHaveBeenCalled();
		});

		it("should preserve existing non-array req.body if already defined", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"content-length": "6",
				},
				bodyPayload: "city=NY",
				existingBody: { country: "USA" },
			});
			const next = vi.fn();

			await urlencoded()(req, res, next);

			expect(req.body).toEqual({ country: "USA", city: "NY" });
		});

		it("should replace req.body if existing req.body is an array or primitive", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"content-length": "6",
				},
				bodyPayload: "city=NY",
				existingBody: ["existing-item"],
			});
			const next = vi.fn();

			await urlencoded()(req, res, next);

			expect(req.body).toEqual({ city: "NY" });
		});

		it("should initialize req.body as empty object if rawBody is empty and req.body is undefined", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"content-length": "0",
				},
				bodyPayload: "   ",
			});
			const next = vi.fn();

			await urlencoded()(req, res, next);

			expect(req.body).toEqual({});
			expect(next).toHaveBeenCalled();
		});

		it("should leave existing req.body untouched if rawBody is empty", async () => {
			const existing = { preserved: true };
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"content-length": "0",
				},
				bodyPayload: "",
				existingBody: existing,
			});
			const next = vi.fn();

			await urlencoded()(req, res, next);

			expect(req.body).toBe(existing);
			expect(next).toHaveBeenCalled();
		});

		it("should return 413 Payload Too Large when payload limit exceeded", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"content-length": "100",
				},
				// biome-ignore lint/style/useTemplate: using string concatenation for test clarity
				bodyPayload: "key=" + "v".repeat(90),
			});

			await urlencoded({ limit: "20b" })(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(413);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Payload Too Large",
			});
		});

		it("should return 400 Bad Request when urlencoded body read fails with invalid length", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"content-length": "not-numeric",
				},
			});

			await urlencoded()(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(400);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Bad Request: Malformed URL-encoded payload",
			});
		});
	});

	describe("xml() & parseNativeXml", () => {
		it("should skip parsing when content-type is not XML and preserve req.body", async () => {
			const existing = { preexisting: true };
			const { req, res } = createMockRequestResponse({
				headers: { "content-type": "text/plain" },
				existingBody: existing,
			});
			const next = vi.fn();

			await xml()(req, res, next);

			expect(req.body).toBe(existing);
			expect(next).toHaveBeenCalled();
		});

		it("should initialize req.body to empty object when skipped and req.body is undefined", async () => {
			const { req, res } = createMockRequestResponse({
				headers: { "content-type": "text/plain" },
			});
			const next = vi.fn();

			await xml()(req, res, next);

			expect(req.body).toEqual({});
			expect(next).toHaveBeenCalled();
		});

		it("should match text/xml and +xml content types", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/atom+xml",
					"content-length": "14",
				},
				bodyPayload: "<item>ok</item>",
			});
			const next = vi.fn();

			await xml()(req, res, next);

			expect(req.body).toEqual({ item: "ok" });
			expect(next).toHaveBeenCalled();
		});

		it("should assign empty object if XML payload is empty or only comments/declarations", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "text/xml",
					"content-length": "45",
				},
				bodyPayload: "<?xml version='1.0'?><!-- only a comment -->",
			});
			const next = vi.fn();

			await xml()(req, res, next);

			expect(req.body).toEqual({});
			expect(next).toHaveBeenCalled();
		});

		it("should parse a closed CDATA section", async () => {
			const xmlPayload = "<message><![CDATA[hello <world>]]></message>";
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": String(xmlPayload.length),
				},
				bodyPayload: xmlPayload,
			});
			const next = vi.fn();

			await xml()(req, res, next);

			expect(req.body).toEqual({ message: "" });
			expect(next).toHaveBeenCalled();
		});

		it("should assign an empty object for a whitespace-only XML body", async () => {
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": "3",
				},
				bodyPayload: "   ",
			});
			const next = vi.fn();

			await xml()(req, res, next);

			expect(req.body).toEqual({});
			expect(next).toHaveBeenCalled();
		});

		it("should parse elements, attributes with single/double quotes, entities, and 3+ repeated children", async () => {
			const xmlPayload = `
				<catalog status="active" version='2'>
					<title>Subatom &amp; Node &lt;v1&gt; &apos;fast&apos; &quot;safe&quot;</title>
					<category>Web</category>
					<category>Framework</category>
					<category>TypeScript</category>
				</catalog>
			`;

			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": String(xmlPayload.length),
				},
				bodyPayload: xmlPayload,
			});
			const next = vi.fn();

			await xml()(req, res, next);

			expect(req.body).toEqual({
				catalog: {
					"@_status": "active",
					"@_version": "2",
					title: "Subatom & Node <v1> 'fast' \"safe\"",
					category: ["Web", "Framework", "TypeScript"],
				},
			});
			expect(next).toHaveBeenCalled();
		});

		it("should parse top-level self-closing tags with and without attributes", async () => {
			const { req: req1, res: res1 } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": "24",
				},
				bodyPayload: "<item key=\"val\" id='1' />",
			});
			await xml()(req1, res1, vi.fn());
			expect(req1.body).toEqual({ "@_key": "val", "@_id": "1" });

			const { req: req2, res: res2 } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": "10",
				},
				bodyPayload: "<empty />",
			});
			await xml()(req2, res2, vi.fn());
			expect(req2.body).toEqual({});
		});

		it("should parse element containing both attributes and text content", async () => {
			const xmlPayload = '<status code="200">OK</status>';
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": String(xmlPayload.length),
				},
				bodyPayload: xmlPayload,
			});
			const next = vi.fn();

			await xml()(req, res, next);

			expect(req.body).toEqual({
				status: {
					"@_code": "200",
					"#text": "OK",
				},
			});
			expect(next).toHaveBeenCalled();
		});

		it("should handle attributes with unquoted or spaced values skipping smoothly", async () => {
			const xmlPayload = "<tag attr1=unquoted attr2 />";
			const { req, res } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": String(xmlPayload.length),
				},
				bodyPayload: xmlPayload,
			});
			await xml()(req, res, vi.fn());
			expect(req.body).toEqual({});
		});

		it("should return 400 when XML contains unclosed CDATA", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": "40",
				},
				bodyPayload: "<root><![CDATA[unclosed</root>",
			});

			await xml()(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(400);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Bad Request: Invalid XML Payload",
			});
		});

		it("should return 400 when XML contains invalid tag name or mismatched closing tag", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": "30",
				},
				bodyPayload: "<>",
			});

			await xml()(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(400);
		});

		it("should return 400 when tag has mismatched closing tag", async () => {
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": "35",
				},
				bodyPayload: "<root><subnode></wrong></root>",
			});

			await xml()(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(400);
		});

		it("should return 413 when XML Buffer exceeds configured limit", async () => {
			const payload = Buffer.from("<root>payload-too-large</root>");
			const { req, res, resHelper } = createMockRequestResponse({
				headers: {
					"content-type": "application/xml",
					"content-length": String(payload.length),
				},
				bodyPayload: payload,
			});

			await xml({ limit: "8b" })(req, res, vi.fn());

			expect(resHelper.statusCode).toBe(413);
			expect(resHelper.sentJson).toEqual({
				success: false,
				message: "Payload Too Large",
			});
		});
	});
});
