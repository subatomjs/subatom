// utils/errorFormatter.ts

import { Request } from "../modules/http/Request.js";
import { Response } from "../modules/http/Response.js";
import { SubatomError } from "./Error.js";
import { env } from "../config/env.js";

export class ErrorFormatter {
  public static handle(
    err: Error | SubatomError,
    req: Request,
    res: Response,
  ): void {
    const isDev = env.NODE_ENV !== "production";

    // 1. Extract Details
    const statusCode = (err as SubatomError).statusCode || 500;
    const errorCode = (err as SubatomError).errorCode || "INTERNAL_SERVER_ERROR";
    const message = err.message || "An unexpected error occurred";
    const details = (err as SubatomError).details;

    // 2. Check content-type preference (HTML vs JSON)
    const acceptsHtml = req.headers["accept"]?.includes("text/html");

    if (isDev) {
      // -------------------------------------------------------------
      // DEVELOPMENT MODE: Detailed diagnostic output
      // -------------------------------------------------------------
      if (acceptsHtml) {
        const html = ErrorFormatter.renderDevHtml(
          err,
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
          stack: err.stack ? err.stack.split("\n    ") : [],
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
      const isOperational = (err as SubatomError).isOperational ?? false;

      // Safe public message
      const publicMessage = isOperational ? message : "Internal Server Error";

      if (acceptsHtml) {
        res.status(statusCode).setHeader("Content-Type", "text/html").send(`
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
    err: Error,
    req: Request,
    status: number,
    code: string,
  ): string {
    const stack = err.stack
      ? err.stack.replace(/</g, "&lt;").replace(/>/g, "&gt;")
      : "No stack trace available";

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Subatom Error: ${err.message}</title>
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
          <h1>${err.message || "Unhandled Exception"}</h1>
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
