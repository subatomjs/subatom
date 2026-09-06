import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findAndLoadConfig } from "../../../../../packages/core/server/services/loadConfig.service.js";

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn(),
		readFileSync: vi.fn(),
	},
}));

describe("loadConfig.service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return empty object when no config file exists", async () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);

		const config = await findAndLoadConfig();
		expect(config).toEqual({});
	});

	it("should parse and return JSON configuration when subatom.config.json exists", async () => {
		vi.mocked(fs.existsSync).mockImplementation((filePath) => {
			return String(filePath).endsWith("subatom.config.json");
		});
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({ port: 4000, appName: "json-app" }),
		);

		const config = await findAndLoadConfig();
		expect(config).toEqual({ port: 4000, appName: "json-app" });
	});

	it("should gracefully break and return empty object if reading/parsing fails", async () => {
		vi.mocked(fs.existsSync).mockImplementation((filePath) => {
			return String(filePath).endsWith("subatom.config.json");
		});
		vi.mocked(fs.readFileSync).mockImplementation(() => {
			throw new Error("Disk read error");
		});

		const config = await findAndLoadConfig();
		expect(config).toEqual({});
	});

	it("should load and unwrap a JavaScript default export", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "subatom-config-"));
		const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(directory);

		try {
			await writeFile(
				path.join(directory, "subatom.config.js"),
				"export default { port: 4310, appName: 'js-app' };\n",
			);
			vi.mocked(fs.existsSync).mockImplementation((filePath) =>
				String(filePath).endsWith("subatom.config.js"),
			);

			expect(await findAndLoadConfig()).toEqual({
				port: 4310,
				appName: "js-app",
			});
		} finally {
			cwdSpy.mockRestore();
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("should return an empty object when a module import fails", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "subatom-config-"));
		const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(directory);

		try {
			await writeFile(
				path.join(directory, "subatom.config.mjs"),
				"export default { invalid: ; };\n",
			);
			vi.mocked(fs.existsSync).mockImplementation((filePath) =>
				String(filePath).endsWith("subatom.config.mjs"),
			);

			expect(await findAndLoadConfig()).toEqual({});
		} finally {
			cwdSpy.mockRestore();
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("should normalize an empty module export to an empty configuration", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "subatom-config-"));
		const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(directory);

		try {
			await writeFile(
				path.join(directory, "subatom.config.mjs"),
				"export default undefined;\n",
			);
			vi.mocked(fs.existsSync).mockImplementation((filePath) =>
				String(filePath).endsWith("subatom.config.mjs"),
			);

			expect(await findAndLoadConfig()).toEqual({});
		} finally {
			cwdSpy.mockRestore();
			await rm(directory, { recursive: true, force: true });
		}
	});
});
