import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../../../package/core/http/errors/Error.js";
import {
	anyFiles,
	array,
	fields,
	none,
	single,
} from "../../../package/core/pipeline/file-system/fileUploadPipe.js";
import * as parserModule from "../../../package/core/pipeline/file-system/multipartParser.js";
import { UploadFile } from "../../../package/core/pipeline/file-system/UploadFile.js";

function mockReqRes(
	headers: Record<string, string> = {
		"content-type": "multipart/form-data; boundary=xyz",
	},
) {
	const req: any = {
		headers,
		getHeaders: () => headers,
		getStream: () => ({ unpipe: vi.fn(), resume: vi.fn() }),
		body: {},
	};

	const res: any = {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
		writeHead: vi.fn(),
		end: vi.fn(),
		headersSent: false,
	};

	const next = vi.fn();
	return { req, res, next };
}

function createFile(name: string, field = "file") {
	return new UploadFile({
		filename: name,
		encoding: "7bit",
		mimetype: "text/plain",
		storageType: "memory",
		buffer: Buffer.from("content"),
	});
}

describe("File Upload Middlewares", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Non-multipart Passthrough", () => {
		it("passes through immediately when content-type is not multipart", async () => {
			const { req, res, next } = mockReqRes({
				"content-type": "application/json",
			});
			const mw = single("avatar");

			await mw(req, res, next);
			expect(next).toHaveBeenCalledTimes(1);
			expect(next).toHaveBeenCalledWith();
		});
	});

	describe("single()", () => {
		it("attaches single file to req.file and req.files", async () => {
			const file = createFile("avatar.png", "avatar");
			vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
				body: { user: "alice" },
				files: { avatar: [file] },
			});

			const { req, res, next } = mockReqRes();
			const mw = single("avatar");

			expect(mw._fileConfig).toEqual({
				type: "single",
				fieldname: "avatar",
				options: { storage: "memory" },
			});

			await mw(req, res, next);

			expect(req.body.user).toBe("alice");
			expect(req.file).toBe(file);
			expect(req.files).toEqual({ avatar: [file] });
			expect(next).toHaveBeenCalledWith();
		});

		it("sends response directly when parseMultipart throws", async () => {
			vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
				new BadRequestError("Bad stream"),
			);

			const { req, res, next } = mockReqRes();
			const mw = single("avatar");

			await mw(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ error: "Bad stream" });
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("array()", () => {
		it("accepts multiple files within maxCount", async () => {
			const f1 = createFile("pic1.png", "photos");
			const f2 = createFile("pic2.png", "photos");
			vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
				body: {},
				files: { photos: [f1, f2] },
			});

			const { req, res, next } = mockReqRes();
			const mw = array("photos", 3);

			await mw(req, res, next);

			expect(req.files).toEqual([f1, f2]);
			expect(req.file).toBe(f1);
			expect(next).toHaveBeenCalledWith();
		});

		it("rejects, destroys files, and responds 413 when exceeding maxCount", async () => {
			const f1 = createFile("pic1.png");
			const f2 = createFile("pic2.png");
			const destroySpy1 = vi.spyOn(f1, "destroy");
			const destroySpy2 = vi.spyOn(f2, "destroy");

			vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
				body: {},
				files: { photos: [f1, f2] },
			});

			const { req, res, next } = mockReqRes();
			const mw = array("photos", 1);

			await mw(req, res, next);

			expect(destroySpy1).toHaveBeenCalled();
			expect(destroySpy2).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(413);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining("Too many files"),
				}),
			);
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("fields()", () => {
		it("maps fields according to fieldsConfig", async () => {
			const avatar = createFile("a.png", "avatar");
			const doc = createFile("d.pdf", "doc");

			vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
				body: {},
				files: { avatar: [avatar], doc: [doc] },
			});

			const { req, res, next } = mockReqRes();
			const mw = fields([
				{ name: "avatar", maxCount: 1 },
				{ name: "doc", maxCount: 2 },
			]);

			await mw(req, res, next);

			expect(req.files).toEqual({
				avatar: [avatar],
				doc: [doc],
			});
			expect(next).toHaveBeenCalledWith();
		});

		it("rejects and cleans up when a specific field exceeds its limit", async () => {
			const a1 = createFile("a1.png");
			const a2 = createFile("a2.png");
			const destroySpy = vi.spyOn(a1, "destroy");

			vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
				body: {},
				files: { avatar: [a1, a2] },
			});

			const { req, res, next } = mockReqRes();
			const mw = fields([{ name: "avatar", maxCount: 1 }]);

			await mw(req, res, next);

			expect(destroySpy).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(413);
		});
	});

	describe("anyFiles()", () => {
		it("accepts any and all files uploaded", async () => {
			const f1 = createFile("1.png");
			const f2 = createFile("2.png");

			vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
				body: { note: "all files" },
				files: { a: [f1], b: [f2] },
			});

			const { req, res, next } = mockReqRes();
			const mw = anyFiles();

			await mw(req, res, next);

			expect(req.body.note).toBe("all files");
			expect(req.files).toEqual({ a: [f1], b: [f2] });
			expect(next).toHaveBeenCalledWith();
		});
	});

	describe("none()", () => {
		it("allows request with body only and zero files", async () => {
			vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
				body: { textOnly: "true" },
				files: {},
			});

			const { req, res, next } = mockReqRes();
			const mw = none();

			await mw(req, res, next);

			expect(req.body.textOnly).toBe("true");
			expect(next).toHaveBeenCalledWith();
		});

		it("rejects, cleans up, and responds 400 when files are sent to none()", async () => {
			const f = createFile("disallowed.txt");
			const destroySpy = vi.spyOn(f, "destroy");

			vi.spyOn(parserModule, "parseMultipart").mockResolvedValue({
				body: {},
				files: { upload: [f] },
			});

			const { req, res, next } = mockReqRes();
			const mw = none();

			await mw(req, res, next);

			expect(destroySpy).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				error: "File uploads are not permitted on this endpoint",
			});
		});
	});

	describe("sendUploadError fallback path", () => {
		it("calls next(err) if res cannot handle any response methods", async () => {
			vi.spyOn(parserModule, "parseMultipart").mockRejectedValue(
				new Error("Generic Failure"),
			);
			const req: any = { headers: { "content-type": "multipart/form-data" } };
			const res: any = {}; // No status, writeHead, or raw
			const next = vi.fn();

			const mw = single("file");
			await mw(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});
});
