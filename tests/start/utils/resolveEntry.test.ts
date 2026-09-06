/// <reference types="node" />
/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	resolveEntry,
	EntryNotFoundError,
} from "../../../start/utils/resolveEntry.js";

vi.mock("node:fs");

describe("resolveEntry", () => {
	const cwd = "/root/project";

	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should throw error if entry is undefined, empty or whitespace", () => {
		expect(() => resolveEntry(undefined, cwd)).toThrow(
			/Invalid entry: Expected a non-empty string path/,
		);
		expect(() => resolveEntry("", cwd)).toThrow(/Invalid entry/);
		expect(() => resolveEntry("   ", cwd)).toThrow(/Invalid entry/);
		expect(() => resolveEntry(null as any, cwd)).toThrow(/Invalid entry/);
	});

	it("should throw EntryNotFoundError if file does not exist", () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(false);

		expect(() => resolveEntry("src/main.ts", cwd)).toThrow(EntryNotFoundError);
		expect(() => resolveEntry("src/main.ts", cwd)).toThrow(
			/Entry file "src\/main.ts" does not exist/,
		);
	});

	it("should throw error if entry resolves to a directory", () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => true,
		} as any);

		expect(() => resolveEntry("src", cwd)).toThrow(/resolved to a directory/);
	});

	it("should return resolved absolute path for a valid relative path", () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);

		const result = resolveEntry("src/index.ts", cwd);
		expect(result).toBe(path.resolve(cwd, "src/index.ts"));
	});

	it("should return absolute path directly if absolute path was provided", () => {
		const abs = path.resolve(cwd, "custom/entry.ts");
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => false,
		} as any);

		const result = resolveEntry(abs, cwd);
		expect(result).toBe(abs);
	});
});
