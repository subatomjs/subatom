import { createReadStream, existsSync, statSync } from "node:fs";
import { ServerResponse } from "node:http";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { SubatomError } from "../../errors/Error";
import { MIME_TYPES } from "../../utils/mime";

export interface CookieOptions {
  /** Max age in milliseconds (converted to seconds per spec). */
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  path?: string;
  domain?: string;
  sameSite?: "Strict" | "Lax" | "None" | boolean;
}

export interface SendFileOptions {
  /**
   * Directory the requested path must resolve inside of. Strongly
   * recommended whenever the path (or any part of it) can be influenced
   * by user input, to prevent path-traversal attacks.
   */
  root?: string;
  /** Override the auto-detected Content-Type. */
  contentType?: string;
}

export interface DownloadOptions extends SendFileOptions {
  filename?: string;
}

/** Matches CR/LF so header values can't be used to smuggle extra headers. */
const CRLF_PATTERN = /[\r\n]/;

/** RFC 5987 percent-encoding for the `filename*` attribute (non-ASCII names). */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}

/** Best-effort ASCII fallback for the plain `filename` attribute. */
function toAsciiFallback(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
}

function assertNoHeaderInjection(name: string, value: string): void {
  if (CRLF_PATTERN.test(value)) {
    throw new SubatomError(
      `Refusing to set header "${name}": value contains CR/LF characters (possible header injection).`,
      { statusCode: 500, errorCode: "HEADER_INJECTION_BLOCKED" },
    );
  }
}

export class Response {
  public readonly raw: ServerResponse;

  private _statusCode = 200;
  private readonly _headers: Map<string, string | string[]> = new Map();

  constructor(native_response: ServerResponse) {
    this.raw = native_response;
  }

  // ============================================================
  // State inspection
  // ============================================================

  public get headersSent(): boolean {
    return this.raw.headersSent;
  }

  public get writableEnded(): boolean {
    return this.raw.writableEnded;
  }

  /** Alias of `writableEnded`, mirrors the naming used elsewhere in the framework. */
  public get finished(): boolean {
    return this.raw.writableEnded;
  }

  public get statusCode(): number {
    return this._statusCode;
  }

  public get rawResponse(): ServerResponse {
    return this.raw;
  }

  // ============================================================
  // Status & headers
  // ============================================================

  /** Set the HTTP status code. No-ops (with a warning) once headers are sent. */
  public status(code: number): this {
    if (this.headersSent) {
      console.warn(
        `[Subatom Warning]: Cannot set status code (${code}) after headers are sent.`,
      );
      return this;
    }
    if (!Number.isInteger(code) || code < 100 || code > 599) {
      throw new SubatomError(
        `Invalid HTTP status code: ${code}. Must be an integer between 100 and 599.`,
        { statusCode: 500, errorCode: "INVALID_STATUS_CODE" },
      );
    }
    this._statusCode = code;
    this.raw.statusCode = code;
    return this;
  }

  public set(name: string, value: string | string[]): this;
  public set(headers: Record<string, string | string[]>): this;
  public set(
    nameOrHeaders: string | Record<string, string | string[]>,
    value?: string | string[],
  ): this {
    if (this.headersSent) {
      console.warn(
        "[Subatom Warning]: Cannot set headers after they are sent to the client.",
      );
      return this;
    }

    if (typeof nameOrHeaders === "string") {
      if (value === undefined) return this;

      for (const v of Array.isArray(value) ? value : [value]) {
        assertNoHeaderInjection(nameOrHeaders, v);
      }

      this._headers.set(nameOrHeaders.toLowerCase(), value);
      this.raw.setHeader(nameOrHeaders, value);
      return this;
    }

    for (const [key, val] of Object.entries(nameOrHeaders)) {
      this.set(key, val);
    }
    return this;
  }

  /** Append a value to an existing header instead of overwriting it. */
  public append(name: string, value: string | string[]): this {
    const existing = this.get(name);
    const incoming = Array.isArray(value) ? value : [value];

    if (existing === undefined) {
      return this.set(name, incoming.length === 1 ? incoming[0]! : incoming);
    }

    const merged = Array.isArray(existing) ? [...existing] : [existing];
    merged.push(...incoming);
    return this.set(name, merged);
  }

  public get(name: string): string | string[] | undefined {
    return this._headers.get(name.toLowerCase());
  }

  /** Convenience alias for `set`. */
  public setHeader(headerName: string, value: string | string[]): this {
    return this.set(headerName, value);
  }

  /** Convenience alias for `set`. */
  public header(name: string, value: string | string[]): this {
    return this.set(name, value);
  }

  public type(contentType: string): this {
    return this.set("Content-Type", contentType);
  }

  /** Alias of `type`. */
  public contentType(contentType: string): this {
    return this.type(contentType);
  }

  public removeHeader(name: string): this {
    if (this.headersSent) {
      console.warn(
        `[Subatom Warning]: Cannot remove header "${name}" after headers are sent.`,
      );
      return this;
    }
    this._headers.delete(name.toLowerCase());
    this.raw.removeHeader(name);
    return this;
  }

  /** Adds "Vary" semantics without clobbering any existing value. */
  public vary(field: string): this {
    const existing = this.get("Vary");
    const fields = new Set(
      (Array.isArray(existing) ? existing.join(",") : (existing ?? ""))
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean),
    );
    fields.add(field);
    return this.set("Vary", Array.from(fields).join(", "));
  }

  public location(url: string): this {
    assertNoHeaderInjection("Location", url);
    return this.set("Location", url);
  }

  // ============================================================
  // Cookies
  // ============================================================

  public cookie(
    name: string,
    value: string,
    options: CookieOptions = {},
  ): this {
    assertNoHeaderInjection("Set-Cookie (name)", name);
    assertNoHeaderInjection("Set-Cookie (value)", value);

    const parts: string[] = [
      `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    ];

    if (options.maxAge !== undefined) {
      parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
    }
    if (options.expires) {
      parts.push(`Expires=${options.expires.toUTCString()}`);
    }
    if (options.domain) {
      assertNoHeaderInjection("Set-Cookie (domain)", options.domain);
      parts.push(`Domain=${options.domain}`);
    }
    parts.push(`Path=${options.path || "/"}`);

    if (options.secure) {
      parts.push("Secure");
    }
    // Default to HttpOnly=true for security unless explicitly disabled.
    if (options.httpOnly ?? true) {
      parts.push("HttpOnly");
    }
    if (options.sameSite) {
      const sameSiteVal =
        typeof options.sameSite === "boolean" ? "Strict" : options.sameSite;
      parts.push(`SameSite=${sameSiteVal}`);
    }

    const cookieString = parts.join("; ");
    const existing = this.get("Set-Cookie");

    if (Array.isArray(existing)) {
      this.set("Set-Cookie", [...existing, cookieString]);
    } else if (existing) {
      this.set("Set-Cookie", [existing, cookieString]);
    } else {
      this.set("Set-Cookie", cookieString);
    }

    return this;
  }

  public clearCookie(name: string, options: CookieOptions = {}): this {
    const { maxAge, ...cookieOptions } = options;
    return this.cookie(name, "", { ...cookieOptions, expires: new Date(0) });
  }

  // ============================================================
  // Redirect
  // ============================================================

  public redirect(url: string, statusCode = 302): void {
    if (statusCode < 300 || statusCode > 399) {
      throw new SubatomError(
        `Invalid redirect status code: ${statusCode}. Must be a 3xx status.`,
        { statusCode: 500, errorCode: "INVALID_REDIRECT_STATUS" },
      );
    }
    assertNoHeaderInjection("Location", url);
    this.status(statusCode).set("Location", url).send();
  }

  // ============================================================
  // Body transmission
  // ============================================================

  public send(body?: string | Buffer | Uint8Array | object): void {
    if (this.writableEnded) return;

    if (body === undefined || body === null) {
      this.raw.end();
      return;
    }

    // Auto-delegate plain objects (but not binary payloads) to JSON.
    if (
      typeof body === "object" &&
      !(body instanceof Buffer) &&
      !(body instanceof Uint8Array)
    ) {
      this.json(body);
      return;
    }

    if (typeof body === "string" && !this.get("Content-Type")) {
      this.type("text/html; charset=utf-8");
    }

    const length =
      body instanceof Buffer
        ? body.length
        : body instanceof Uint8Array
          ? body.byteLength
          : Buffer.byteLength(body as string);

    this.set("Content-Length", length.toString());
    this.raw.end(body);
  }

  public json(data: unknown): this {
    if (this.writableEnded) return this;

    let payload: string;
    try {
      payload = JSON.stringify(data);
    } catch (stringifyError: any) {
      throw new SubatomError(
        `Failed to serialize JSON response: ${stringifyError.message}`,
        { statusCode: 500, errorCode: "JSON_SERIALIZATION_ERROR" },
      );
    }

    if (!this.get("Content-Type")) {
      this.type("application/json; charset=utf-8");
    }

    this.send(payload);
    return this;
  }

  public html(htmlContent: string): this {
    if (!this.get("Content-Type")) {
      this.type("text/html; charset=utf-8");
    }
    this.send(htmlContent);
    return this;
  }

  /** End the response stream manually, bypassing the higher-level helpers. */
  public end(chunk?: any): void {
    if (!this.writableEnded) {
      this.raw.end(chunk);
    }
  }

  // ============================================================
  // Streaming / files
  // ============================================================

  /**
   * Pipe an arbitrary readable stream to the client. Stream errors are
   * caught and converted into a 500 response (if headers haven't been
   * sent yet) instead of crashing the process.
   */
  public stream(readableStream: NodeJS.ReadableStream): void {
    if (this.writableEnded) return;

    readableStream.on("error", (err) => this.handleStreamError(err));
    readableStream.pipe(this.raw);
  }

  /**
   * Send a file inline (browser decides how to render it, e.g. images/PDFs).
   * Content-Type is inferred from the extension unless overridden.
   */
  public sendFile(filePath: string, options: SendFileOptions = {}): void {
    const resolvedPath = this.resolveSafePath(filePath, options.root);
    if (resolvedPath === null) {
      this.status(403).send("Forbidden");
      return;
    }
    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
      this.status(404).send("File not found");
      return;
    }

    const ext = extname(resolvedPath).toLowerCase();
    this.type(
      options.contentType || MIME_TYPES[ext] || "application/octet-stream",
    );
    this.set("Content-Length", statSync(resolvedPath).size.toString());

    this.pipeFile(resolvedPath);
  }

  /**
   * Send a file as a forced download (`Content-Disposition: attachment`).
   */
  public download(
    filePath: string,
    filename?: string,
    options: DownloadOptions = {},
  ): void {
    const resolvedPath = this.resolveSafePath(filePath, options.root);
    if (resolvedPath === null) {
      this.status(403).send("Forbidden");
      return;
    }
    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
      this.status(404).send("File not found");
      return;
    }

    const resolvedFilename =
      filename || options.filename || basename(resolvedPath);
    this.attachment(resolvedFilename);
    this.type(
      options.contentType ||
        MIME_TYPES[extname(resolvedPath).toLowerCase()] ||
        "application/octet-stream",
    );
    this.set("Content-Length", statSync(resolvedPath).size.toString());

    this.pipeFile(resolvedPath);
  }

  /**
   * Set Content-Disposition. Encodes non-ASCII filenames per RFC 5987 and
   * escapes quotes to prevent header/attribute injection.
   */
  public attachment(filename?: string): this {
    if (!filename) {
      this.set("Content-Disposition", "attachment");
      return this;
    }

    assertNoHeaderInjection("Content-Disposition", filename);
    const asciiName = toAsciiFallback(filename);
    const encodedName = encodeRfc5987(filename);

    this.set(
      "Content-Disposition",
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
    );
    return this;
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  /**
   * Resolves `filePath` (optionally relative to `root`) and, when `root`
   * is provided, verifies the result doesn't escape it — blocks path
   * traversal (`../../etc/passwd`) when the path may come from user input.
   * Returns null if the resolved path escapes the given root.
   */
  private resolveSafePath(filePath: string, root?: string): string | null {
    if (!root) {
      return isAbsolute(filePath) ? filePath : resolve(filePath);
    }

    const resolvedRoot = resolve(root);
    const resolvedPath = resolve(resolvedRoot, filePath);

    if (
      resolvedPath !== resolvedRoot &&
      !resolvedPath.startsWith(resolvedRoot + "/")
    ) {
      return null;
    }
    return resolvedPath;
  }

  private pipeFile(resolvedPath: string): void {
    const fileStream = createReadStream(resolvedPath);
    fileStream.on("error", (err) => this.handleStreamError(err));
    fileStream.pipe(this.raw);
  }

  private handleStreamError(err: NodeJS.ErrnoException): void {
    console.error(
      "[Subatom Error]: Stream failure while writing response.",
      err,
    );
    if (!this.headersSent) {
      this.status(500).send("Internal Server Error");
    } else if (!this.writableEnded) {
      this.raw.end();
    }
  }
}
