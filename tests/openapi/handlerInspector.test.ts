import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFileMetadata } from "../../openapi/handlerInspector.js";
import type { FileMetadata } from "../../openapi/types/openapi.types.js";

describe("handlerInspector", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("extractFileMetadata", () => {
		it("should return null if the handler is not a function", () => {
			expect(extractFileMetadata(null)).toBeNull();
			expect(extractFileMetadata(undefined)).toBeNull();
			expect(extractFileMetadata("not-a-function")).toBeNull();
			expect(extractFileMetadata(12345)).toBeNull();
			expect(extractFileMetadata({})).toBeNull();
		});

		it("should return null if handler function has no _fileConfig", () => {
			const handler = () => {};
			expect(extractFileMetadata(handler)).toBeNull();
		});

		it("should return config when valid single file config is present", () => {
			const handler = () => {};
			const config: FileMetadata = { type: "single", fieldname: "avatar" };
			Object.assign(handler, { _fileConfig: config });

			expect(extractFileMetadata(handler)).toEqual(config);
		});

		it("should return config when valid array file config is present", () => {
			const handler = () => {};
			const config: FileMetadata = { type: "array", fieldname: "photos", maxCount: 5 };
			Object.assign(handler, { _fileConfig: config });

			expect(extractFileMetadata(handler)).toEqual(config);
		});

		it("should return config when valid fields file config is present", () => {
			const handler = () => {};
			const config: FileMetadata = {
				type: "fields",
				fields: [{ name: "doc", maxCount: 1 }],
			};
			Object.assign(handler, { _fileConfig: config });

			expect(extractFileMetadata(handler)).toEqual(config);
		});

		it("should warn and return null for invalid config type with named handler", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			function uploadHandler() {}
			Object.assign(uploadHandler, { _fileConfig: { type: "invalid-type" } });

			const result = extractFileMetadata(uploadHandler);

			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Handler has a _fileConfig property"),
				"uploadHandler",
			);
		});

		it("should fallback to 'anonymous' in warning when handler has no name", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const anonymousHandler = (() => () => {})() as { (): void; _fileConfig?: unknown };
			Object.defineProperty(anonymousHandler, "name", { value: "" });
			anonymousHandler._fileConfig = { type: "corrupt" };

			const result = extractFileMetadata(anonymousHandler);

			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Handler has a _fileConfig property"),
				"anonymous",
			);
		});
	});
});