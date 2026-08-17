import { describe, expect, it } from "vitest";
import {
	extractFileMetadata,
	type FileMetadata,
} from "../../../package/core/docs/handlerInspector.js";

describe("handlerInspector - extractFileMetadata", () => {
	it("should return _fileConfig directly when attached to the handler", () => {
		const customConfig: FileMetadata = {
			type: "fields",
			fields: [
				{ name: "avatar", maxCount: 1 },
				{ name: "gallery", maxCount: 5 },
			],
		};

		const handler = () => {};
		(handler as any)._fileConfig = customConfig;

		const result = extractFileMetadata(handler);
		expect(result).toBe(customConfig);
	});

	it("should infer 'single' file upload from function body/name string representation", () => {
		function upload_single_file(_req: any, _res: any, _next: any) {
			// single upload logic
		}

		const result = extractFileMetadata(upload_single_file);
		expect(result).toEqual({ type: "single" });
	});

	it("should infer 'array' file upload from function body/name string representation", () => {
		function handle_array_upload(_req: any, _res: any, _next: any) {
			// array upload logic
		}

		const result = extractFileMetadata(handle_array_upload);
		expect(result).toEqual({ type: "array" });
	});

	it("should infer 'fields' file upload from function body/name string representation", () => {
		function parse_fields_payload(_req: any, _res: any, _next: any) {
			// fields upload logic
		}

		const result = extractFileMetadata(parse_fields_payload);
		expect(result).toEqual({ type: "fields" });
	});

	it("should return null if handler is not a file middleware", () => {
		function regularAuthMiddleware(_req: any, _res: any, next: any) {
			next();
		}

		const result = extractFileMetadata(regularAuthMiddleware);
		expect(result).toBeNull();
	});

	it("should prioritize _fileConfig over string matching", () => {
		const customConfig: FileMetadata = {
			type: "array",
			fieldname: "docs",
			maxCount: 10,
		};

		// Function contains "single" in string representation, but has explicit _fileConfig for "array"
		function singleFileHandler() {}
		(singleFileHandler as any)._fileConfig = customConfig;

		const result = extractFileMetadata(singleFileHandler);
		expect(result).toEqual(customConfig);
	});
});
