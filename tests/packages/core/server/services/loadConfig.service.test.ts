import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
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
});