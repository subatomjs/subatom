/// <reference types="node" />
import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Response } from "../../../package/core/http/response/Response.js";
import * as downloadMethods from "../../../package/core/http/streams/methods/file/resDownload.js";
import * as fileMethods from "../../../package/core/http/streams/methods/file/resSendFile.js";
import * as endMethods from "../../../package/core/http/streams/methods/response/resEnd.js";
import * as sendStreamMethods from "../../../package/core/http/streams/methods/response/resSendStream.js";
import * as streamMethods from "../../../package/core/http/streams/methods/response/resStream.js";
import * as writeMethods from "../../../package/core/http/streams/methods/response/resWrite.js";

describe("Response (Main Class)", () => {
	let raw: ServerResponse;
	let res: Response;

	beforeEach(() => {
		raw = {
			statusCode: 200,
			headersSent: false,
			writableEnded: false,
			setHeader: vi.fn(),
			removeHeader: vi.fn(),
			end: vi.fn(),
			write: vi.fn(),
		} as unknown as ServerResponse;

		res = new Response(raw);
	});

	describe("State getters", () => {
		it("should expose correct status, raw, and state properties", () => {
			expect(res.statusCode).toBe(200);
			expect(res.raw).toBe(raw);
			expect(res.rawResponse).toBe(raw);
			expect(res.headersSent).toBe(false);
			expect(res.writableEnded).toBe(false);
			expect(res.finished).toBe(false);
			expect(res.helper).toBeDefined();
		});
	});

	describe("Status & Header Methods", () => {
		it("should update status code fluently", () => {
			const chain = res.status(201);
			expect(chain).toBe(res);
			expect(res.statusCode).toBe(201);
			expect(raw.statusCode).toBe(201);
		});

		it("should set headers using key/value, aliases, and bulk objects", () => {
			res.set("X-Custom", "123");
			expect(res.get("x-custom")).toBe("123");

			res.header("X-Alias-1", "A1");
			expect(res.get("x-alias-1")).toBe("A1");

			res.setHeader("X-Alias-2", "A2");
			expect(res.get("x-alias-2")).toBe("A2");

			res.set({ "X-Bulk-1": "B1", "X-Bulk-2": "B2" });
			expect(res.get("x-bulk-1")).toBe("B1");
			expect(res.get("x-bulk-2")).toBe("B2");
		});

		it("should append header values", () => {
			res.set("X-List", "item1");
			res.append("X-List", "item2");
			expect(res.get("x-list")).toEqual(["item1", "item2"]);
		});

		it("should remove headers", () => {
			res.set("X-Temp", "val");
			expect(res.get("x-temp")).toBe("val");

			res.removeHeader("X-Temp");
			expect(res.get("x-temp")).toBeUndefined();
			expect(raw.removeHeader).toHaveBeenCalledWith("X-Temp");
		});

		it("should set content type using type() and contentType()", () => {
			res.type("application/json");
			expect(res.get("content-type")).toBe("application/json");

			res.contentType("text/plain");
			expect(res.get("content-type")).toBe("text/plain");
		});

		it("should apply vary headers", () => {
			res.vary("Origin");
			expect(res.get("vary")).toBe("Origin");
			res.vary("User-Agent");
			expect(res.get("vary")).toBe("Origin, User-Agent");
		});

		it("should set location header with security validation", () => {
			res.location("/dashboard");
			expect(res.get("location")).toBe("/dashboard");

			expect(() => res.location("/bad\r\nlocation")).toThrowError(
				/Refusing to set header "Location"/,
			);
		});
	});

	describe("Cookies", () => {
		it("should set and clear cookies", () => {
			res.cookie("auth", "xyz");
			expect(res.get("set-cookie")).toBe("auth=xyz; Path=/; HttpOnly");

			res.clearCookie("auth");
			expect(Array.isArray(res.get("set-cookie"))).toBe(true);
		});
	});

	describe("Redirect & Body Methods", () => {
		it("should execute redirect chain", () => {
			res.redirect("/target", 301);
			expect(res.statusCode).toBe(301);
			expect(res.get("location")).toBe("/target");
			expect(raw.end).toHaveBeenCalled();
		});

		it("should send body and json payloads", () => {
			res.send("Hello World");
			expect(res.get("content-type")).toBe("text/html; charset=utf-8");
			expect(raw.end).toHaveBeenCalledWith("Hello World");

			res.json({ success: true });
			expect(raw.end).toHaveBeenCalledWith(JSON.stringify({ success: true }));
		});

		it("should send html payload and set HTML content-type if missing", () => {
			res.html("<h1>Subatom</h1>");
			expect(res.get("content-type")).toBe("text/html; charset=utf-8");
			expect(raw.end).toHaveBeenCalledWith("<h1>Subatom</h1>");
		});

		it("should set attachment header", () => {
			res.attachment("doc.pdf");
			expect(res.get("content-disposition")).toContain("doc.pdf");
		});

		it("should delegate format response", () => {
			const formatHandler = vi.fn();
			res.format({ "text/html": formatHandler }, { accept: "text/html" });
			expect(formatHandler).toHaveBeenCalledTimes(1);
		});
	});

	describe("Streaming & File Delegation", () => {
		it("should delegate write, end, stream, sendStream, sendFile, and download", () => {
			const writeSpy = vi.spyOn(writeMethods, "resWrite").mockReturnValue(true);
			const endSpy = vi
				.spyOn(endMethods, "resEnd")
				.mockImplementation(() => {});
			const streamSpy = vi
				.spyOn(streamMethods, "resStream")
				.mockImplementation(() => {});
			const sendStreamSpy = vi
				.spyOn(sendStreamMethods, "resSendStream")
				.mockImplementation(() => {});
			const sendFileSpy = vi
				.spyOn(fileMethods, "resSendFile")
				.mockImplementation(() => {});
			const downloadSpy = vi
				.spyOn(downloadMethods, "resDownload")
				.mockImplementation(() => {});

			const dummyStream = new Readable({ read() {} });

			res.write("chunk");
			expect(writeSpy).toHaveBeenCalledWith(raw, "chunk", undefined, undefined);

			res.end();
			expect(endSpy).toHaveBeenCalledWith(raw, undefined, undefined, undefined);

			res.stream(dummyStream);
			expect(streamSpy).toHaveBeenCalledWith(raw, dummyStream, undefined);

			res.sendStream(dummyStream);
			expect(sendStreamSpy).toHaveBeenCalledWith(raw, dummyStream, undefined);

			res.sendFile("/path/file.txt");
			expect(sendFileSpy).toHaveBeenCalledWith(raw, "/path/file.txt", {});

			res.download("/path/file.txt", "custom.txt");
			expect(downloadSpy).toHaveBeenCalledWith(
				raw,
				"/path/file.txt",
				"custom.txt",
				{},
			);
		});
	});
});
