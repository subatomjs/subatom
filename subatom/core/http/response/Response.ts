import type { ServerResponse } from "node:http";
import type {
	CookieOptions,
	DownloadOptions,
	IResponse,
	SendFileOptions,
} from "../../../types/http/IResponse.js";
import { appendHeader } from "./services/appendHeader.service.js";
import { clearCookie, setCookie } from "./services/cookie.service.js";
import { downloadFile } from "./services/downloadFile.service.js";
import { redirect } from "./services/redirect.service.js";
import { removeHeader } from "./services/removeHeader.service.js";
import { sendBody } from "./services/sendBody.service.js";
import { handleStreamError, sendFile } from "./services/sendFile.service.js";
import { sendJson } from "./services/sendJson.service.js";
import { setAttachment } from "./services/setAttachment.service.js";
import {
	assertNoHeaderInjection,
	setHeader,
} from "./services/setHeader.service.js";
// Import exact service per method
import { setStatusCode } from "./services/statusCode.service.js";
import { varyHeader } from "./services/varyHeader.service.js";

export class Response implements IResponse {
	public readonly raw: ServerResponse;

	private _statusCode = 200;
	private readonly _headers: Map<string, string | string[]> = new Map();

	constructor(native_response: ServerResponse) {
		this.raw = native_response;
	}

	// State inspection
	public get headersSent(): boolean {
		return this.raw.headersSent;
	}

	
	public get writableEnded(): boolean {
		return this.raw.writableEnded;
	}

	public get finished(): boolean {
		return this.raw.writableEnded;
	}

	public get statusCode(): number {
		return this._statusCode;
	}

	public get rawResponse(): ServerResponse {
		return this.raw;
	}

	// Status & headers
	public status(code: number): this {
		this._statusCode = setStatusCode(
			this.raw,
			this.headersSent,
			code,
			this._statusCode,
		);
		return this;
	}

	public set(name: string, value: string | string[]): this;
	public set(headers: Record<string, string | string[]>): this;
	public set(
		nameOrHeaders: string | Record<string, string | string[]>,
		value?: string | string[],
	): this {
		setHeader(this.raw, this._headers, this.headersSent, nameOrHeaders, value);
		return this;
	}

	public append(name: string, value: string | string[]): this {
		appendHeader(this.raw, this._headers, this.headersSent, name, value);
		return this;
	}

	public get(name: string): string | string[] | undefined {
		return this._headers.get(name.toLowerCase());
	}

	public setHeader(headerName: string, value: string | string[]): this {
		return this.set(headerName, value);
	}

	public header(name: string, value: string | string[]): this {
		return this.set(name, value);
	}

	public type(contentType: string): this {
		return this.set("Content-Type", contentType);
	}

	public contentType(contentType: string): this {
		return this.type(contentType);
	}

	public removeHeader(name: string): this {
		removeHeader(this.raw, this._headers, this.headersSent, name);
		return this;
	}

	public vary(field: string): this {
		varyHeader(this.raw, this._headers, this.headersSent, field);
		return this;
	}

	public location(url: string): this {
		assertNoHeaderInjection("Location", url);
		return this.set("Location", url);
	}

	// Cookies
	public cookie(
		name: string,
		value: string,
		options: CookieOptions = {},
	): this {
		setCookie(this.raw, this._headers, this.headersSent, name, value, options);
		return this;
	}

	public clearCookie(name: string, options: CookieOptions = {}): this {
		clearCookie(this.raw, this._headers, this.headersSent, name, options);
		return this;
	}

	// Redirect
	public redirect(url: string, statusCode = 302): void {
		redirect(url, statusCode, (code, loc) => {
			this.status(code).set("Location", loc).send();
		});
	}

	// Body transmission
	public send(body?: string | Buffer | Uint8Array | object): void {
		sendBody(this.raw, this._headers, this.headersSent, body, (data) =>
			this.json(data),
		);
	}

	public json(data: unknown): this {
		sendJson(this.raw, this._headers, this.headersSent, data);
		return this;
	}

	public html(htmlContent: string): this {
		if (!this.get("Content-Type")) {
			this.type("text/html; charset=utf-8");
		}
		this.send(htmlContent);
		return this;
	}

	public end(chunk?: any): void {
		if (!this.writableEnded) {
			this.raw.end(chunk);
		}
	}

	// Streaming / files
	public stream(readableStream: NodeJS.ReadableStream): void {
		if (this.writableEnded) return;

		readableStream.on("error", (err) =>
			handleStreamError(this.raw, this.headersSent, err, (code) =>
				this.status(code),
			),
		);
		readableStream.pipe(this.raw);
	}

	public sendFile(filePath: string, options: SendFileOptions = {}): void {
		sendFile(
			this.raw,
			this._headers,
			this.headersSent,
			filePath,
			options,
			(code) => this.status(code),
		);
	}

	public download(
		filePath: string,
		filename?: string,
		options: DownloadOptions = {},
	): void {
		downloadFile(
			this.raw,
			this._headers,
			this.headersSent,
			filePath,
			filename,
			options,
			(code) => this.status(code),
		);
	}

	public attachment(filename?: string): this {
		setAttachment(this.raw, this._headers, this.headersSent, filename);
		return this;
	}
}
