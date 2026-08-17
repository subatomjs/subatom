import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readUserPackageJson } from "../../package/watch-engine/utils/pkg.js";

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(),
	mockReadFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: mockExistsSync,
		readFileSync: mockReadFileSync,
	};
});

describe("readUserPackageJson", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns parsed package.json when file exists", () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(
			JSON.stringify({ name: "my-app", type: "module" }),
		);

		const result = readUserPackageJson("/fake/dir");
		expect(result).toEqual({ name: "my-app", type: "module" });
	});

	it("returns empty object when package.json does not exist", () => {
		mockExistsSync.mockReturnValue(false);

		const result = readUserPackageJson("/fake/dir");
		expect(result).toEqual({});
	});
});
