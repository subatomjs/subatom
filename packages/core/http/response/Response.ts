/**
 * @fileoverview The Response.ts is a scaffolding of outgoint Server response from node.js
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import type {
	CookieOptions,
	DownloadOptions,
	FormatHandlers,
	IResponse,
	IResponseHelper,
	SendFileOptions,
} from "./types/response.types.js";
import {
	resDownload,
	resSendFile,
	resEnd,
	resSendStream,
	resStream,
	resWrite,
	type TypeResEndCallback,
	type ISendStreamOptions,
	type IStreamOptions,
	type TypeResWriteCallback,
} from "../streams/methods/index.js";

import { ResponseHelper } from "./helpers/ResponseHelper.js";
import { appendHeader } from "./services/appendHeader.service.js";
import { clearCookie, setCookie } from "./services/cookie.service.js";
import { formatResponse } from "./services/format.service.js";
import { redirect } from "./services/redirect.service.js";
import { removeHeader } from "./services/removeHeader.service.js";
import { sendBody } from "./services/sendBody.service.js";
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
	public readonly helper: IResponseHelper;

	private _statusCode = 200;
	private readonly _headers: Map<string, string | string[]> = new Map();

	constructor(native_response: ServerResponse) {
		this.raw = native_response;
		this.helper = new ResponseHelper(this);
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

	// --- Streaming & File Transmission ---

	public write(
		chunk: string | Buffer | Uint8Array,
		encoding?: BufferEncoding,
		callback?: TypeResWriteCallback,
	): boolean {
		return resWrite(this.raw, chunk, encoding, callback);
	}

	public end(
		chunk?: string | Buffer | Uint8Array,
		encoding?: BufferEncoding,
		callback?: TypeResEndCallback,
	): void {
		resEnd(this.raw, chunk, encoding, callback);
	}

	public stream(
		readableStream: Readable,
		options?: IStreamOptions,
	): Promise<void> {
		return resStream(this.raw, readableStream, options);
	}

	public sendStream(
		readableStream: Readable,
		options?: ISendStreamOptions,
	): void {
		resSendStream(this.raw, readableStream, options);
	}

	public sendFile(filePath: string, options: SendFileOptions = {}): void {
		resSendFile(this.raw, filePath, options);
	}

	public download(
		filePath: string,
		filename?: string,
		options: DownloadOptions = {},
	): void {
		resDownload(this.raw, filePath, filename, options);
	}

	public attachment(filename?: string): this {
		setAttachment(this.raw, this._headers, this.headersSent, filename);
		return this;
	}

	public format(
		handlers: FormatHandlers,
		requestHeaders: Record<string, string | string[] | undefined>,
	): this {
		formatResponse(
			this.raw,
			requestHeaders,
			this.headersSent,
			handlers,
			(contentType) => this.type(contentType),
		);
		return this;
	}
}
