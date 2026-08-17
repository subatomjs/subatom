/// <reference types="node" />

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	EntryNotFoundError,
	resolveEntry,
} from "../../package/watch-engine/utils/findEntry.js";
import { logger } from "../../package/watch-engine/utils/logger.js";

const { mockExistsSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: mockExistsSync,
	};
});

describe("resolveEntry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves the configured entry when it exists", () => {
		const expected = path.resolve("/app", "src/custom.ts");
		mockExistsSync.mockImplementation((p: string) => p === expected);

		const result = resolveEntry("src/custom.ts", "/app");
		expect(result).toBe(expected);
	});

	it("falls back to default entry points if configured entry does not exist", () => {
		const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
		const serverPath = path.resolve("/app", "src/server.ts");

		mockExistsSync.mockImplementation((p: string) => p === serverPath);

		const result = resolveEntry("src/missing.ts", "/app");
		expect(result).toBe(serverPath);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"Configured entry not found, using detected entry",
			),
		);
	});

	it("throws EntryNotFoundError when no candidates exist", () => {
		mockExistsSync.mockReturnValue(false);

		expect(() => resolveEntry("src/nonexistent.ts", "/app")).toThrow(
			EntryNotFoundError,
		);
	});
});
