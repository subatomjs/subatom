/**
 * @fileoverview Responsible for format errors in html and json with Next.js-inspired dev overlay.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { env } from "../../config/env/env.js";
import type { IRequest } from "../core/http/request/types/request.types.js";
import type { IResponse } from "../core/http/response/types/response.types.js";
import type { SubatomError } from "./Errors.js";
import type { IParsedStackFrame } from "./types/subatom.error.types.js";

// biome-ignore lint/complexity/noStaticOnlyClass: Static utility class for error formatting
export class ErrorFormatter {
	public static handle(err: unknown, req: IRequest, res: IResponse): void {
		const isDev = env.NODE_ENV !== "production";

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
		const stack = safeErr.stack || "";

		const wantsHtml = ErrorFormatter.shouldRenderHtml(req);

		if (isDev) {
			if (wantsHtml) {
				const html = ErrorFormatter.renderDevHtml(
					message,
					stack,
					req,
					statusCode,
					errorCode,
					details,
				);
				res
					.status(statusCode)
					.setHeader("Content-Type", "text/html; charset=utf-8")
					.send(html);
			} else {
				res.status(statusCode).json({
					status: "error",
					framework: "Subatom",
					statusCode,
					errorCode,
					message,
					details,
					stack: stack ? stack.split("\n").map((line) => line.trim()) : [],
					request: {
						method: req.method,
						path: req.path,
						url: req.url,
						params: req.params,
						query: req.query,
						headers: req.headers,
					},
				});
			}
		} else {
			const isOperational = safeErr.isOperational ?? false;
			const publicMessage = isOperational ? message : "Internal Server Error";

			if (wantsHtml) {
				res
					.status(statusCode)
					.setHeader("Content-Type", "text/html; charset=utf-8")
					.send(ErrorFormatter.renderProdHtml(statusCode, publicMessage));
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

	/**
	 * Accurately differentiates actual browser navigation requests from API clients
	 * (Postman, ThunderClient, curl, Insomnia, native fetch/ajax calls).
	 */
	private static shouldRenderHtml(req: IRequest): boolean {
		const secFetchDest = req.get("sec-fetch-dest")?.toLowerCase();
		const secFetchMode = req.get("sec-fetch-mode")?.toLowerCase();
		const accept = req.get("accept")?.toLowerCase() || "";
		const userAgent = req.get("user-agent")?.toLowerCase() || "";

		// Explicit browser top-level HTML document navigations
		if (secFetchDest === "document" || secFetchMode === "navigate") {
			return true;
		}

		// Reject known API clients and CLI testing tools even if they accept */* or text/html
		const isApiClient =
			userAgent.includes("postman") ||
			userAgent.includes("insomnia") ||
			userAgent.includes("thunder client") ||
			userAgent.includes("curl") ||
			userAgent.includes("wget") ||
			userAgent.includes("httpie");

		if (isApiClient) {
			return false;
		}

		// Check if text/html is explicitly requested before JSON or general wildcards
		if (accept.includes("text/html")) {
			const htmlPos = accept.indexOf("text/html");
			const jsonPos = accept.indexOf("application/json");

			if (jsonPos === -1 || htmlPos < jsonPos) {
				return true;
			}
		}

		return false;
	}

	private static escapeHtml(input: unknown): string {
		return String(input ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	private static parseStackTrace(rawStack: string): IParsedStackFrame[] {
		if (!rawStack) return [];

		const lines = rawStack.split("\n");
		const frames: IParsedStackFrame[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("at ")) continue;

			// Handles "at Function.name (path/to/file.ts:12:34)"
			const withFnMatch = trimmed.match(/^at (.+?)\s+\((.+):(\d+):(\d+)\)$/);
			if (withFnMatch) {
				const callSite = withFnMatch[1] ?? "anonymous";
				const filePath = withFnMatch[2] ?? "";
				const lineNumber = withFnMatch[3] ?? "";
				const columnNumber = withFnMatch[4] ?? "";
				const isInternal =
					filePath.includes("node_modules") ||
					filePath.startsWith("node:") ||
					filePath.includes("internal/");

				frames.push({
					callSite,
					filePath,
					lineNumber,
					columnNumber,
					isInternal,
					raw: trimmed,
				});
				continue;
			}

			// Handles "at path/to/file.ts:12:34"
			const rawFileMatch = trimmed.match(/^at (.+):(\d+):(\d+)$/);
			if (rawFileMatch) {
				const filePath = rawFileMatch[1] ?? "";
				const lineNumber = rawFileMatch[2] ?? "";
				const columnNumber = rawFileMatch[3] ?? "";
				const isInternal =
					filePath.includes("node_modules") ||
					filePath.startsWith("node:") ||
					filePath.includes("internal/");

				frames.push({
					callSite: "anonymous",
					filePath,
					lineNumber,
					columnNumber,
					isInternal,
					raw: trimmed,
				});
				continue;
			}

			frames.push({
				callSite: "unknown",
				filePath: "",
				lineNumber: "",
				columnNumber: "",
				isInternal: true,
				raw: trimmed,
			});
		}

		return frames;
	}

	private static renderDevHtml(
		message: string,
		rawStack: string,
		req: IRequest,
		status: number,
		code: string,
		details?: unknown,
	): string {
		const frames = ErrorFormatter.parseStackTrace(rawStack);
		const userFrames = frames.filter((f) => !f.isInternal);
		const initialFrames = userFrames.length > 0 ? userFrames : frames;

		const stackFramesHtml = initialFrames
			.map(
				(frame) => `
        <div class="frame-item ${frame.isInternal ? "is-internal" : ""}">
          <div class="frame-header">
            <span class="frame-fn">${ErrorFormatter.escapeHtml(frame.callSite)}</span>
            <span class="frame-loc">${ErrorFormatter.escapeHtml(frame.filePath)}${
							frame.lineNumber
								? `:${frame.lineNumber}:${frame.columnNumber}`
								: ""
						}</span>
          </div>
          <div class="frame-raw">${ErrorFormatter.escapeHtml(frame.raw)}</div>
        </div>
      `,
			)
			.join("");

		const detailsJson = details
			? ErrorFormatter.escapeHtml(JSON.stringify(details, null, 2))
			: null;
		const headersJson = ErrorFormatter.escapeHtml(
			JSON.stringify(req.headers || {}, null, 2),
		);
		const queryJson = ErrorFormatter.escapeHtml(
			JSON.stringify(req.query || {}, null, 2),
		);
		const paramsJson = ErrorFormatter.escapeHtml(
			JSON.stringify(req.params || {}, null, 2),
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subatom Error: ${ErrorFormatter.escapeHtml(message)}</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --card-bg: #121212;
      --panel-bg: #18181b;
      --border: #27272a;
      --border-accent: #3f3f46;
      --accent: #f43f5e;
      --accent-muted: rgba(244, 63, 94, 0.12);
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --text-subtle: #71717a;
      --code-bg: #09090b;
      --badge-bg: #27272a;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.5;
      padding: 32px 24px;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .header-bar {
      padding: 16px 20px;
      background: var(--panel-bg);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .header-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .badge-error {
      background: var(--accent-muted);
      color: var(--accent);
      border: 1px solid rgba(244, 63, 94, 0.3);
    }
    .badge-method {
      background: #27272a;
      color: #e4e4e7;
      font-family: var(--font-mono);
    }
    .route-path {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-muted);
    }
    .copy-btn {
      background: var(--panel-bg);
      border: 1px solid var(--border-accent);
      color: var(--text-muted);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      font-family: var(--font-sans);
      transition: all 0.15s ease;
    }
    .copy-btn:hover {
      background: var(--border);
      color: var(--text);
    }
    .error-title-section {
      padding: 24px 20px;
      border-bottom: 1px solid var(--border);
    }
    .error-title {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      word-break: break-word;
      font-family: var(--font-mono);
      line-height: 1.4;
    }
    .tabs-bar {
      display: flex;
      background: var(--panel-bg);
      border-bottom: 1px solid var(--border);
      padding: 0 12px;
      gap: 4px;
    }
    .tab {
      padding: 10px 14px;
      font-size: 13px;
      color: var(--text-subtle);
      border-bottom: 2px solid transparent;
      cursor: pointer;
      font-weight: 500;
      user-select: none;
    }
    .tab.active {
      color: var(--text);
      border-bottom-color: var(--accent);
    }
    .tab-content {
      display: none;
      padding: 20px;
    }
    .tab-content.active {
      display: block;
    }
    .frame-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .frame-item {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .frame-item.is-internal {
      opacity: 0.6;
    }
    .frame-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 4px;
    }
    .frame-fn {
      color: #38bdf8;
      font-weight: 600;
    }
    .frame-loc {
      color: var(--text-subtle);
      font-size: 11px;
    }
    .frame-raw {
      color: var(--text-muted);
      word-break: break-all;
    }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #e4e4e7;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      font-size: 12px;
      color: var(--text-subtle);
      border-top: 1px solid var(--border);
      background: var(--panel-bg);
    }
    .json-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .json-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .json-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-subtle);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header-bar">
        <div class="header-meta">
          <span class="badge badge-error">${status} ${ErrorFormatter.escapeHtml(code)}</span>
          <span class="badge badge-method">${ErrorFormatter.escapeHtml(req.method)}</span>
          <span class="route-path">${ErrorFormatter.escapeHtml(req.url || req.path)}</span>
        </div>
        <button class="copy-btn" id="copyBtn" onclick="copyError()">Copy Error</button>
      </div>

      <div class="error-title-section">
        <div class="error-title">${ErrorFormatter.escapeHtml(message)}</div>
      </div>

      <div class="tabs-bar">
        <div class="tab active" onclick="switchTab('stackTab', this)">Stack Trace</div>
        <div class="tab" onclick="switchTab('requestTab', this)">Request Details</div>
        ${detailsJson ? `<div class="tab" onclick="switchTab('detailsTab', this)">Details</div>` : ""}
        <div class="tab" onclick="switchTab('rawTab', this)">Raw Error</div>
      </div>

      <div id="stackTab" class="tab-content active">
        <div class="frame-list">
          ${stackFramesHtml || `<pre>${ErrorFormatter.escapeHtml(rawStack || "No stack trace recorded.")}</pre>`}
        </div>
      </div>

      <div id="requestTab" class="tab-content">
        <div class="json-grid">
          <div class="json-card">
            <span class="json-title">Headers</span>
            <pre>${headersJson}</pre>
          </div>
          <div class="json-card">
            <span class="json-title">Query Parameters</span>
            <pre>${queryJson}</pre>
          </div>
          <div class="json-card">
            <span class="json-title">Route Parameters</span>
            <pre>${paramsJson}</pre>
          </div>
        </div>
      </div>

      ${
				detailsJson
					? `
      <div id="detailsTab" class="tab-content">
        <pre>${detailsJson}</pre>
      </div>`
					: ""
			}

      <div id="rawTab" class="tab-content">
        <pre>${ErrorFormatter.escapeHtml(rawStack || message)}</pre>
      </div>

      <div class="footer">
        <span>Subatom Runtime Diagnostics (Development Mode)</span>
        <span>${new Date().toISOString()}</span>
      </div>
    </div>
  </div>

  <script>
    function switchTab(tabId, el) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      const target = document.getElementById(tabId);
      if (target) target.classList.add('active');
    }

    function copyError() {
      const text = ${JSON.stringify(`${message}\n\n${rawStack}`)};
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Error'; }, 2000);
      });
    }
  </script>
</body>
</html>`;
	}

	private static renderProdHtml(status: number, message: string): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${status} - ${ErrorFormatter.escapeHtml(message)}</title>
  <style>
    body {
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .box {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      border-right: 1px solid #27272a;
      padding-right: 20px;
      margin: 0;
    }
    p {
      font-size: 14px;
      color: #a1a1aa;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="box">
    <h1>${status}</h1>
    <p>${ErrorFormatter.escapeHtml(message)}</p>
  </div>
</body>
</html>`;
	}
}
