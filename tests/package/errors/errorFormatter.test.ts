import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	BadRequestError,
	NotFoundError,
	SubatomError,
} from "../../../package/core/http/errors/Error.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

// Control environment mode dynamically via a module-scoped variable
let currentEnv = "development";

// Mock the exact module import that errorFormatter.ts resolves
vi.mock("../../../package/config/env/env.js", () => ({
	env: {
		get NODE_ENV() {
			return currentEnv;
		},
	},
}));

// Also alias relative mock path in case of module resolution variations
vi.mock("../../../config/env/env.js", () => ({
	env: {
		get NODE_ENV() {
			return currentEnv;
		},
	},
}));

import { ErrorFormatter } from "../../../package/core/http/errors/errorFormatter.js";

describe("ErrorFormatter (Enterprise Unit Tests)", () => {
	let mockReq: Partial<IRequest>;
	let mockRes: Partial<IResponse>;
	let headers: Record<string, string>;

	beforeEach(() => {
		headers = {};
		currentEnv = "development";

		mockReq = {
			method: "GET",
			path: "/api/test",
			headers: {
				host: "localhost:3000",
				"user-agent": "vitest-agent",
			},
			get: vi.fn((headerName: string) => headers[headerName.toLowerCase()]),
		};

		mockRes = {
			status: vi.fn().mockReturnThis(),
			setHeader: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	describe("Development Environment (NODE_ENV !== 'production')", () => {
		beforeEach(() => {
			currentEnv = "development";
		});

		describe("JSON Formatting (Default / Accept: application/json)", () => {
			it("should format a standard SubatomError with status, error code, stack array, and request debug metadata", () => {
				const error = new BadRequestError("Invalid payload provided", {
					field: "email",
				});
				error.stack =
					"Error: Invalid payload provided\n    at Object.<anonymous> (/app/index.ts:10:15)";

				ErrorFormatter.handle(error, mockReq as IRequest, mockRes as IResponse);

				expect(mockRes.status).toHaveBeenCalledWith(400);
				expect(mockRes.json).toHaveBeenCalledWith({
					status: "error",
					framework: "Subatom",
					statusCode: 400,
					errorCode: "BAD_REQUEST",
					message: "Invalid payload provided",
					details: { field: "email" },
					stack: [
						"Error: Invalid payload provided",
						"at Object.<anonymous> (/app/index.ts:10:15)",
					],
					request: {
						method: "GET",
						path: "/api/test",
						headers: mockReq.headers,
					},
				});
			});

			it("should handle an error without a stack trace and return an empty stack array", () => {
				const error = new SubatomError("No stack error");
				delete (error as any).stack;

				ErrorFormatter.handle(error, mockReq as IRequest, mockRes as IResponse);

				expect(mockRes.status).toHaveBeenCalledWith(500);
				expect(mockRes.json).toHaveBeenCalledWith(
					expect.objectContaining({
						statusCode: 500,
						errorCode: "INTERNAL_SERVER_ERROR",
						message: "No stack error",
						stack: [],
					}),
				);
			});

			it("should extract string message when a primitive string is thrown directly", () => {
				const rawStringError = "A raw string exception occurred";

				ErrorFormatter.handle(
					rawStringError,
					mockReq as IRequest,
					mockRes as IResponse,
				);

				expect(mockRes.status).toHaveBeenCalledWith(500);
				expect(mockRes.json).toHaveBeenCalledWith(
					expect.objectContaining({
						statusCode: 500,
						errorCode: "INTERNAL_SERVER_ERROR",
						message: "A raw string exception occurred",
						details: undefined,
						stack: [],
					}),
				);
			});

			it("should fall back to default message when null, undefined, or numbers are thrown", () => {
				ErrorFormatter.handle(null, mockReq as IRequest, mockRes as IResponse);

				expect(mockRes.status).toHaveBeenCalledWith(500);
				expect(mockRes.json).toHaveBeenCalledWith(
					expect.objectContaining({
						statusCode: 500,
						errorCode: "INTERNAL_SERVER_ERROR",
						message: "An unexpected error occurred",
						details: undefined,
					}),
				);

				ErrorFormatter.handle(12345, mockReq as IRequest, mockRes as IResponse);
				expect(mockRes.json).toHaveBeenCalledWith(
					expect.objectContaining({
						message: "An unexpected error occurred",
					}),
				);
			});

			it("should handle plain object exceptions with partial error properties", () => {
				const objectError = {
					statusCode: 403,
					errorCode: "FORBIDDEN_ACCESS",
					details: { role: "guest" },
				};

				ErrorFormatter.handle(
					objectError,
					mockReq as IRequest,
					mockRes as IResponse,
				);

				expect(mockRes.status).toHaveBeenCalledWith(403);
				expect(mockRes.json).toHaveBeenCalledWith(
					expect.objectContaining({
						statusCode: 403,
						errorCode: "FORBIDDEN_ACCESS",
						message: "An unexpected error occurred",
						details: { role: "guest" },
					}),
				);
			});
		});

		describe("HTML Formatting (Accept: text/html)", () => {
			beforeEach(() => {
				headers["accept"] = "text/html,application/xhtml+xml";
			});

			it("should render a rich developer HTML diagnostic page and escape XML/HTML brackets in stack trace", () => {
				const error = new NotFoundError("User not found");
				error.stack =
					"Error: User not found\n    at <anonymous>:1:1 <script>alert(1)</script>";

				ErrorFormatter.handle(error, mockReq as IRequest, mockRes as IResponse);

				expect(mockRes.status).toHaveBeenCalledWith(404);
				expect(mockRes.setHeader).toHaveBeenCalledWith(
					"Content-Type",
					"text/html",
				);

				const renderedHtml = (mockRes.send as any).mock.calls[0][0] as string;
				expect(renderedHtml).toContain("Subatom Error: User not found");
				expect(renderedHtml).toContain("404 NOT_FOUND");
				expect(renderedHtml).toContain("<strong>GET</strong> /api/test");
				expect(renderedHtml).toContain(
					"&lt;anonymous&gt;:1:1 &lt;script&gt;alert(1)&lt;/script&gt;",
				);
				expect(renderedHtml).toContain("Subatom Dev Server");
			});

			it("should display 'No stack trace available' and handle empty message gracefully in HTML mode", () => {
				const error = { statusCode: 500, message: "" };

				ErrorFormatter.handle(error, mockReq as IRequest, mockRes as IResponse);

				const renderedHtml = (mockRes.send as any).mock.calls[0][0] as string;
				expect(renderedHtml).toContain("<h1>An unexpected error occurred</h1>");
				expect(renderedHtml).toContain("<pre>No stack trace available</pre>");
			});
		});
	});

	describe("Production Environment (NODE_ENV === 'production')", () => {
		beforeEach(() => {
			currentEnv = "production";
		});

		describe("JSON Sanitization", () => {
			it("should expose message and details for operational errors (e.g. 404, 400)", () => {
				const error = new BadRequestError("Invalid credentials", {
					attemptsRemaining: 2,
				});

				ErrorFormatter.handle(error, mockReq as IRequest, mockRes as IResponse);

				expect(mockRes.status).toHaveBeenCalledWith(400);
				expect(mockRes.json).toHaveBeenCalledWith({
					status: "error",
					statusCode: 400,
					message: "Invalid credentials",
					details: { attemptsRemaining: 2 },
				});
				expect(mockRes.json).not.toHaveBeenCalledWith(
					expect.objectContaining({ stack: expect.anything() }),
				);
			});

			it("should omit details key completely if details are undefined on operational errors", () => {
				const error = new NotFoundError("Resource missing");

				ErrorFormatter.handle(error, mockReq as IRequest, mockRes as IResponse);

				expect(mockRes.status).toHaveBeenCalledWith(404);
				expect(mockRes.json).toHaveBeenCalledWith({
					status: "error",
					statusCode: 404,
					message: "Resource missing",
				});
			});

			it("should mask non-operational / unknown errors as generic 'Internal Server Error' and strip details and stack", () => {
				const fatalError = new Error(
					"Database password leaked in trace: secret123",
				);
				(fatalError as any).details = { sensitiveData: "classified" };
				(fatalError as any).isOperational = false;

				ErrorFormatter.handle(
					fatalError,
					mockReq as IRequest,
					mockRes as IResponse,
				);

				expect(mockRes.status).toHaveBeenCalledWith(500);
				expect(mockRes.json).toHaveBeenCalledWith({
					status: "error",
					statusCode: 500,
					message: "Internal Server Error",
				});
			});

			it("should mask raw thrown strings or objects as non-operational in production", () => {
				ErrorFormatter.handle(
					"Unexpected crash string",
					mockReq as IRequest,
					mockRes as IResponse,
				);

				expect(mockRes.status).toHaveBeenCalledWith(500);
				expect(mockRes.json).toHaveBeenCalledWith({
					status: "error",
					statusCode: 500,
					message: "Internal Server Error",
				});
			});
		});

		describe("HTML Sanitization (Accept: text/html)", () => {
			beforeEach(() => {
				headers["accept"] = "text/html";
			});

			it("should render clean, minimal public error page with operational message", () => {
				const error = new NotFoundError("Route does not exist");

				ErrorFormatter.handle(error, mockReq as IRequest, mockRes as IResponse);

				expect(mockRes.status).toHaveBeenCalledWith(404);
				expect(mockRes.setHeader).toHaveBeenCalledWith(
					"Content-Type",
					"text/html",
				);

				const renderedHtml = (mockRes.send as any).mock.calls[0][0] as string;
				expect(renderedHtml).toContain(
					"<title>404 - Route does not exist</title>",
				);
				expect(renderedHtml).toContain("<h1>404</h1>");
				expect(renderedHtml).toContain("<p>Route does not exist</p>");
				expect(renderedHtml).not.toContain("stack");
			});

			it("should render generic 'Internal Server Error' on fatal or non-operational errors in HTML", () => {
				const fatalError = new SubatomError("Fatal system failure", {
					statusCode: 500,
					isOperational: false,
				});

				ErrorFormatter.handle(
					fatalError,
					mockReq as IRequest,
					mockRes as IResponse,
				);

				expect(mockRes.status).toHaveBeenCalledWith(500);
				const renderedHtml = (mockRes.send as any).mock.calls[0][0] as string;
				expect(renderedHtml).toContain(
					"<title>500 - Internal Server Error</title>",
				);
				expect(renderedHtml).toContain("<h1>500</h1>");
				expect(renderedHtml).toContain("<p>Internal Server Error</p>");
			});
		});
	});

	describe("Edge Cases & Header Introspection", () => {
		it("should handle missing or empty Accept header safely by defaulting acceptsHtml to false", () => {
			currentEnv = "development";
			(mockReq.get as any).mockReturnValue(undefined);

			const error = new Error("General error");
			ErrorFormatter.handle(error, mockReq as IRequest, mockRes as IResponse);

			expect(mockRes.json).toHaveBeenCalled();
			expect(mockRes.send).not.toHaveBeenCalled();
		});
	});
});
