/// <reference types="node" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readUserPackageJson } from "../../../start/utils/pkg.js";

vi.mock("node:fs");

describe("readUserPackageJson", () => {
	const cwd = "/fake/workspace";

	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should return empty object if package.json does not exist", () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(false);

		const result = readUserPackageJson(cwd);
		expect(result).toEqual({});
		expect(fs.existsSync).toHaveBeenCalledWith(path.join(cwd, "package.json"));
	});

	it("should parse and return package.json content when present", () => {
		const mockPkg = { name: "test-app", type: "module" as const };
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockPkg));

		const result = readUserPackageJson(cwd);
		expect(result).toEqual(mockPkg);
	});

	it("should default to process.cwd() when directory argument is omitted", () => {
		const processCwdSpy = vi
			.spyOn(process, "cwd")
			.mockReturnValue("/current/dir");
		vi.spyOn(fs, "existsSync").mockReturnValue(false);

		readUserPackageJson();
		expect(processCwdSpy).toHaveBeenCalled();
		expect(fs.existsSync).toHaveBeenCalledWith(
			path.join("/current/dir", "package.json"),
		);
	});
});
