/**
 * @fileoverview Responsible for format errors in html.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { env } from "../../config/env/env.js";
import type { IRequest } from "../core/http/request/types/request.types.js";
import type { IResponse } from "../core/http/response/types/response.types.js";
import type { SubatomError } from "./Errors.js";

// biome-ignore lint/complexity/noStaticOnlyClass: explanation
export class ErrorFormatter {
	public static handle(err: unknown, req: IRequest, res: IResponse): void {
		const isDev = env.NODE_ENV !== "production";

		// 1. Defensively extract details — `err` may not actually be an
		// Error/SubatomError instance if something upstream threw a raw
		// value (null, a string, a plain object, etc.) instead of
		// normalizing it first.
		const safeErr: Partial<SubatomError> & {
			message?: string;
			stack?: string;
		} = err && typeof err === "object" ? (err as SubatomError) : {};

		const statusCode = safeErr.statusCode || 500;
		const errorCode = safeErr.errorCode || "INTERNAL_SERVER_ERROR";
		const message =
			safeErr.message ||
			(typeof err === "string" ? err : "An unexpected error occurred");
		const details = safeErr.details;
		const stack = safeErr.stack;

		// 2. Check content-type preference (HTML vs JSON). Uses the
		// case-insensitive `.get()` helper rather than indexing
		// `req.headers` directly, since a header value can legally arrive
		// as string[] (in which case raw `.includes(...)` checks for an
		// exact array element, not a substring match).
		const acceptsHtml = req.get("accept")?.includes("text/html") ?? false;

		if (isDev) {
			// -------------------------------------------------------------
			// DEVELOPMENT MODE: Detailed diagnostic output
			// -------------------------------------------------------------
			if (acceptsHtml) {
				const html = ErrorFormatter.renderDevHtml(
					message,
					stack,
					req,
					statusCode,
					errorCode,
				);
				res
					.status(statusCode)
					.setHeader("Content-Type", "text/html")
					.send(html);
			} else {
				res.status(statusCode).json({
					status: "error",
					framework: "Subatom",
					statusCode,
					errorCode,
					message,
					details,
					stack: stack ? stack.split("\n    ") : [],
					request: {
						method: req.method,
						path: req.path,
						headers: req.headers,
					},
				});
			}
		} else {
			// -------------------------------------------------------------
			// PRODUCTION MODE: Sanitized & safe output
			// -------------------------------------------------------------
			const isOperational = safeErr.isOperational ?? false;

			// Safe public message
			const publicMessage = isOperational ? message : "Internal Server Error";

			if (acceptsHtml) {
				res
					.status(statusCode)
					.setHeader("Content-Type", "text/html")
					.send(`
          <!DOCTYPE html>
          <html>
            <head><title>${statusCode} - ${publicMessage}</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>${statusCode}</h1>
              <p>${publicMessage}</p>
            </body>
          </html>
        `);
			} else {
				res.status(statusCode).json({
					status: "error",
					statusCode,
					message: publicMessage,
					...(details && isOperational ? { details } : {}),
				});
			}
		}
	}

	private static renderDevHtml(
		message: string,
		rawStack: string | undefined,
		req: IRequest,
		status: number,
		code: string,
	): string {
		const stack = rawStack
			? rawStack.replace(/</g, "&lt;").replace(/>/g, "&gt;")
			: "No stack trace available";

		return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Subatom Error: ${message}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px; }
          .card { background: #1e293b; border-radius: 8px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border-left: 6px solid #ef4444; }
          .badge { background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
          h1 { margin-top: 10px; font-size: 24px; color: #fca5a5; }
          .meta { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
          pre { background: #090d16; padding: 20px; border-radius: 6px; overflow-x: auto; font-family: monospace; color: #e2e8f0; line-height: 1.5; }
          .footer { margin-top: 20px; color: #64748b; font-size: 12px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">${status} ${code}</span>
          <h1>${message || "Unhandled Exception"}</h1>
          <div class="meta"><strong>${req.method}</strong> ${req.path}</div>
          <h3>Stack Trace</h3>
          <pre>${stack}</pre>
          <div class="footer">Subatom Dev Server</div>
        </div>
      </body>
      </html>
    `;
	}
}
