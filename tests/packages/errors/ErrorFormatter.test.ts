import { describe, test, expect, vi, beforeEach } from "vitest";
import { ErrorFormatter } from "../../../packages/errors/ErrorFormatter.js";
import { SubatomError } from "../../../packages/errors/Errors.js";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";

// Mock the environment config module
vi.mock("../../../packages/config/env/env.js", () => ({
	env: {
		NODE_ENV: "development",
	},
}));

import { env } from "../../../config/env/env.js";

const createMockRequest = (
	headers: Record<string, string> = {},
	overrides: Partial<Record<string, unknown>> = {},
): IRequest => {
	const headerMap = new Map(
		Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
	);

	return {
		method: "GET",
		path: "/api/users",
		url: "/api/users?sort=asc",
		params: { id: "123" },
		query: { sort: "asc" },
		headers,
		get: vi.fn((name: string) => headerMap.get(name.toLowerCase())),
		...overrides,
	} as unknown as IRequest;
};

const createMockResponse = (): {
	res: IResponse;
	statusMock: ReturnType<typeof vi.fn>;
	setHeaderMock: ReturnType<typeof vi.fn>;
	sendMock: ReturnType<typeof vi.fn>;
	jsonMock: ReturnType<typeof vi.fn>;
} => {
	const setHeaderMock = vi.fn().mockReturnThis();
	const sendMock = vi.fn().mockReturnThis();
	const jsonMock = vi.fn().mockReturnThis();
	const statusMock = vi.fn().mockReturnValue({
		setHeader: setHeaderMock,
		send: sendMock,
		json: jsonMock,
	});

	const res = {
		status: statusMock,
		setHeader: setHeaderMock,
		send: sendMock,
		json: jsonMock,
	} as unknown as IResponse;

	return { res, statusMock, setHeaderMock, sendMock, jsonMock };
};

describe("ErrorFormatter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(env, "NODE_ENV", {
			value: "development",
			writable: true,
			configurable: true,
		});
	});

	describe("Client Heuristics (shouldRenderHtml)", () => {
		test("renders HTML when sec-fetch-dest is document", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-dest": "document" });
			const { res, setHeaderMock, sendMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("Test"), req, res);

			// Assert
			expect(setHeaderMock).toHaveBeenCalledWith(
				"Content-Type",
				"text/html; charset=utf-8",
			);
			expect(sendMock).toHaveBeenCalledTimes(1);
		});

		test("renders HTML when sec-fetch-mode is navigate", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-mode": "navigate" });
			const { res, setHeaderMock, sendMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("Test"), req, res);

			// Assert
			expect(setHeaderMock).toHaveBeenCalledWith(
				"Content-Type",
				"text/html; charset=utf-8",
			);
			expect(sendMock).toHaveBeenCalledTimes(1);
		});

		test("rejects known API clients even if they request text/html", () => {
			// Arrange
			const clients = [
				"PostmanRuntime/7.29.0",
				"insomnia/2023.5.8",
				"Thunder Client (http-client)",
				"curl/7.88.1",
				"Wget/1.21.3",
				"HTTPie/3.2.1",
			];

			for (const client of clients) {
				const req = createMockRequest({
					"user-agent": client,
					accept: "text/html, application/json",
				});
				const { res, jsonMock } = createMockResponse();

				// Act
				ErrorFormatter.handle(new Error("API Client Fail"), req, res);

				// Assert
				expect(jsonMock).toHaveBeenCalledTimes(1);
			}
		});

		test("renders HTML if text/html appears before application/json in accept header", () => {
			// Arrange
			const req = createMockRequest({
				accept: "text/html,application/xhtml+xml,application/json;q=0.9",
			});
			const { res, sendMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("Browser request"), req, res);

			// Assert
			expect(sendMock).toHaveBeenCalledTimes(1);
		});

		test("renders JSON if application/json appears before text/html in accept header", () => {
			// Arrange
			const req = createMockRequest({
				accept: "application/json, text/html",
			});
			const { res, jsonMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("API preferred"), req, res);

			// Assert
			expect(jsonMock).toHaveBeenCalledTimes(1);
		});

		test("renders JSON by default when no HTML preference is detected", () => {
			// Arrange
			const req = createMockRequest({
				accept: "*/*",
			});
			const { res, jsonMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("Wildcard"), req, res);

			// Assert
			expect(jsonMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("Development Mode (NODE_ENV !== 'production')", () => {
		test("formats JSON error response with complete request and stack debug data", () => {
			// Arrange
			const req = createMockRequest();
			const { res, statusMock, jsonMock } = createMockResponse();

			const error = new SubatomError("Custom test error", {
				statusCode: 422,
				errorCode: "VALIDATION_FAILED",
				details: { field: "username" },
			});

			// Act
			ErrorFormatter.handle(error, req, res);

			// Assert
			expect(statusMock).toHaveBeenCalledWith(422);
			expect(jsonMock).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "error",
					framework: "Subatom",
					statusCode: 422,
					errorCode: "VALIDATION_FAILED",
					message: "Custom test error",
					details: { field: "username" },
					request: expect.objectContaining({
						method: "GET",
						path: "/api/users",
						url: "/api/users?sort=asc",
					}),
				}),
			);
		});

		test("handles string error throwing in dev JSON response", () => {
			// Arrange
			const req = createMockRequest();
			const { res, statusMock, jsonMock } = createMockResponse();

			// Act
			ErrorFormatter.handle("Raw string message thrown", req, res);

			// Assert
			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith(
				expect.objectContaining({
					errorCode: "INTERNAL_SERVER_ERROR",
					message: "Raw string message thrown",
					stack: [],
				}),
			);
		});

		test("handles non-object/non-string error values in dev JSON response", () => {
			// Arrange
			const req = createMockRequest();
			const { res, statusMock, jsonMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(null, req, res);

			// Assert
			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith(
				expect.objectContaining({
					message: "An unexpected error occurred",
					stack: [],
				}),
			);
		});

		test("renders rich HTML dev overlay with parsed stack frames and escapes XSS", () => {
			// Arrange
			const req = createMockRequest(
				{ "sec-fetch-dest": "document" },
				{
					url: "/test?filter=<script>",
					headers: { "x-test": "<b>bold</b>" },
				},
			);
			const { res, statusMock, setHeaderMock, sendMock } = createMockResponse();

			const fakeStack = [
				"Error: Malicious <payload>",
				"    at processRequest (/app/src/controller.ts:42:15)",
				"    at /app/src/runner.ts:10:5",
				"    at node:internal/process/task_queues:95:5",
				"    at unrecognized format without line numbers",
			].join("\n");

			const err = new SubatomError("<script>alert('xss')</script>", {
				statusCode: 500,
				errorCode: "CRASH",
				details: { info: "<strong>Danger</strong>" },
			});
			err.stack = fakeStack;

			// Act
			ErrorFormatter.handle(err, req, res);

			// Assert
			expect(statusMock).toHaveBeenCalledWith(500);
			expect(setHeaderMock).toHaveBeenCalledWith(
				"Content-Type",
				"text/html; charset=utf-8",
			);
			expect(sendMock).toHaveBeenCalledTimes(1);

			const html = sendMock.mock.calls[0][0] as string;

			expect(html).toContain("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
			expect(html).toContain(
				'<div class="error-title">&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;</div>',
			);
			expect(html).toContain("&lt;strong&gt;Danger&lt;/strong&gt;");
			expect(html).toContain("processRequest");
			expect(html).toContain("/app/src/controller.ts");
			expect(html).toContain(":42:15");
			expect(html).toContain("anonymous");
			expect(html).toContain("/app/src/runner.ts");
			expect(html).toContain(":10:5");
			expect(html).toContain('id="detailsTab"');
		});

		test("renders HTML dev overlay when no user stack frames exist (all internal)", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-dest": "document" });
			const { res, sendMock } = createMockResponse();

			const internalOnlyStack = [
				"Error: System bug",
				"    at Module._compile (node:internal/modules/cjs/loader:1256:14)",
				"    at internal/main.js:1:1",
			].join("\n");

			const err = new Error("System bug");
			err.stack = internalOnlyStack;

			// Act
			ErrorFormatter.handle(err, req, res);

			// Assert
			const html = sendMock.mock.calls[0][0] as string;
			expect(html).toContain("is-internal");
			expect(html).toContain("Module._compile");
		});

		test("renders HTML dev overlay when stack trace is missing", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-dest": "document" });
			const { res, sendMock } = createMockResponse();

			const err = { message: "Bare error" };

			// Act
			ErrorFormatter.handle(err, req, res);

			// Assert
			const html = sendMock.mock.calls[0][0] as string;
			expect(html).toContain("No stack trace recorded.");
		});
	});

	describe("Production Mode (NODE_ENV === 'production')", () => {
		beforeEach(() => {
			Object.defineProperty(env, "NODE_ENV", {
				value: "production",
				writable: true,
				configurable: true,
			});
		});

		test("renders generic JSON message for non-operational errors and hides details", () => {
			// Arrange
			const req = createMockRequest();
			const { res, statusMock, jsonMock } = createMockResponse();

			const nonOpError = new SubatomError("DB connection secret credentials", {
				statusCode: 500,
				isOperational: false,
				details: { password: "secret" },
			});

			// Act
			ErrorFormatter.handle(nonOpError, req, res);

			// Assert
			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				status: "error",
				statusCode: 500,
				message: "Internal Server Error",
			});
		});

		test("renders public message and includes details for operational JSON errors", () => {
			// Arrange
			const req = createMockRequest();
			const { res, statusMock, jsonMock } = createMockResponse();

			const opError = new SubatomError("Invalid user input provided", {
				statusCode: 400,
				isOperational: true,
				details: [{ field: "email", error: "Required" }],
			});

			// Act
			ErrorFormatter.handle(opError, req, res);

			// Assert
			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				status: "error",
				statusCode: 400,
				message: "Invalid user input provided",
				details: [{ field: "email", error: "Required" }],
			});
		});

		test("renders minimal static HTML for production browser navigation", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-dest": "document" });
			const { res, statusMock, setHeaderMock, sendMock } = createMockResponse();

			const opError = new SubatomError("Page Not Found", {
				statusCode: 404,
				isOperational: true,
			});

			// Act
			ErrorFormatter.handle(opError, req, res);

			// Assert
			expect(statusMock).toHaveBeenCalledWith(404);
			expect(setHeaderMock).toHaveBeenCalledWith(
				"Content-Type",
				"text/html; charset=utf-8",
			);

			const html = sendMock.mock.calls[0][0] as string;
			expect(html).toContain("<h1>404</h1>");
			expect(html).toContain("<p>Page Not Found</p>");
			expect(html).not.toContain("Subatom Runtime Diagnostics");
		});

		test("renders 'Internal Server Error' in production HTML for unhandled errors", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-dest": "document" });
			const { res, statusMock, sendMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("Fatal crash"), req, res);

			// Assert
			expect(statusMock).toHaveBeenCalledWith(500);
			const html = sendMock.mock.calls[0][0] as string;
			expect(html).toContain("<h1>500</h1>");
			expect(html).toContain("<p>Internal Server Error</p>");
		});
	});

	describe("Uncovered Branch Coverage Edges", () => {
		beforeEach(() => {
			Object.defineProperty(env, "NODE_ENV", {
				value: "development",
				writable: true,
				configurable: true,
			});
		});

		test("handles req.get returning undefined for accept and user-agent headers", () => {
			// Arrange
			const req = {
				method: "GET",
				path: "/api/test",
				url: "/api/test",
				params: {},
				query: {},
				headers: {},
				get: vi.fn(() => undefined),
			} as unknown as IRequest;
			const { res, jsonMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("No headers"), req, res);

			// Assert
			expect(jsonMock).toHaveBeenCalledTimes(1);
		});

		test("handles line 129 accept header branching when text/html is present without application/json", () => {
			// Arrange
			const req = createMockRequest({
				accept: "text/html,text/plain",
			});
			const { res, sendMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("HTML without JSON in accept"), req, res);

			// Assert
			expect(sendMock).toHaveBeenCalledTimes(1);
		});

		test("handles line 129 accept header branching when text/html is absent but other types exist", () => {
			// Arrange
			const req = createMockRequest({
				accept: "application/xml,text/plain",
			});
			const { res, jsonMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("No HTML in accept"), req, res);

			// Assert
			expect(jsonMock).toHaveBeenCalledTimes(1);
		});

		test("exercises all regex branches and internal/external path filters on lines 150-175", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-dest": "document" });
			const { res, sendMock } = createMockResponse();

			const comprehensiveStack = [
				"CustomError: Detailed Stack Branch Test",
				"    skip non-at prefix lines",
				"    at CustomController.execute (/workspace/src/controller.ts:45:12)",
				"    at Loader.load (node:internal/modules/esm:10:4)",
				"    at Module.require (/workspace/node_modules/pkg/index.js:20:8)",
				"    at builtIn (internal/bootstrap.js:5:2)",
				"    at /workspace/src/helpers/utils.ts:88:14",
				"    at /workspace/node_modules/fast-json/parse.js:12:3",
				"    at node:path:15:2",
				"    at internal/process.js:30:5",
			].join("\n");

			const err = new Error("Trace parser target");
			err.stack = comprehensiveStack;

			// Act
			ErrorFormatter.handle(err, req, res);

			// Assert
			const html = sendMock.mock.calls[0][0] as string;
			expect(html).toContain("CustomController.execute");
			expect(html).toContain("anonymous");
			expect(html).toContain("/workspace/src/helpers/utils.ts");
		});

		test("renders fallback frame with unknown callSite when only unparseable at-lines are provided", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-dest": "document" });
			const { res, sendMock } = createMockResponse();

			const unparseableStack = [
				"Error: Unparseable",
				"    at just-some-unparseable-symbol",
			].join("\n");

			const err = new Error("Fallback trace target");
			err.stack = unparseableStack;

			// Act
			ErrorFormatter.handle(err, req, res);

			// Assert
			const html = sendMock.mock.calls[0][0] as string;
			expect(html).toContain("unknown");
			expect(html).toContain("is-internal");
			expect(html).toContain("just-some-unparseable-symbol");
			expect(html).toContain('<span class="frame-loc"></span>');
		});

		test("falls back to req.path when req.url is falsy in dev HTML view", () => {
			// Arrange
			const req = {
				method: "POST",
				path: "/fallback/path",
				url: "",
				params: undefined,
				query: undefined,
				headers: undefined,
				get: vi.fn((header: string) =>
					header === "sec-fetch-dest" ? "document" : undefined,
				),
			} as unknown as IRequest;
			const { res, sendMock } = createMockResponse();

			// Act
			ErrorFormatter.handle(new Error("URL Fallback"), req, res);

			// Assert
			const html = sendMock.mock.calls[0][0] as string;
			expect(html).toContain('<span class="route-path">/fallback/path</span>');
			expect(html).toContain("Headers");
			expect(html).toContain("{}");
		});

		test("handles empty string error stack line iterations", () => {
			// Arrange
			const req = createMockRequest({ "sec-fetch-dest": "document" });
			const { res, sendMock } = createMockResponse();

			const err = new Error("Stack with blanks");
			err.stack = "\n    at fn (/app/index.ts:1:1)\n\n    \n";

			// Act
			ErrorFormatter.handle(err, req, res);

			// Assert
			expect(sendMock).toHaveBeenCalledTimes(1);
		});
	});
});