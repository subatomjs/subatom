/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { runStart } from "../../../start/commands/start.js";
import * as loadConfig from "../../../config/helpers/load.config.js";
import * as portUtil from "../../../start/utils/port.js";
import * as spawnUtil from "../../../start/utils/spawnProcess.js";
import * as resolveUtil from "../../../start/utils/resolveEntry.js";
import { logger } from "../../../start/utils/logger.js";

vi.mock("node:fs");
vi.mock("../../../config/helpers/load.config.js");
vi.mock("../../../start/utils/port.js");
vi.mock("../../../start/utils/spawnProcess.js");
vi.mock("../../../start/utils/resolveEntry.js");

describe("runStart", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
	let loggerSuccessSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit called");
		}) as any);
		loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
		loggerSuccessSpy = vi.spyOn(logger, "success").mockImplementation(() => {});

		vi.spyOn(process, "cwd").mockReturnValue("/app");
		vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
			entry: "src/app.ts",
			outDir: "dist",
		} as any);

		vi.spyOn(resolveUtil, "resolveEntry").mockReturnValue("/app/src/app.ts");
		vi.spyOn(spawnUtil, "runProcess").mockImplementation((() => {}) as any);
		vi.spyOn(portUtil, "resolvePort").mockResolvedValue(8080);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should resolve entry and use default config port when port is not configured", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(resolveUtil, "resolveEntry").mockReturnValue("/app/src/main.ts");
		vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
			entry: "src/main.ts",
		} as any);
		vi.spyOn(portUtil, "resolvePort").mockResolvedValue(8080);

		await runStart({});

		expect(spawnUtil.runProcess).toHaveBeenCalledWith(
			process.execPath,
			["/app/dist/main.js"],
			expect.objectContaining({
				env: expect.objectContaining({ PORT: "8080", HOST: "localhost" }),
			}),
		);
	});

	it("should exit 1 when entry resolution fails with Error and non-Error", async () => {
		vi.spyOn(resolveUtil, "resolveEntry").mockImplementation(() => {
			throw new Error("Failed resolution");
		});

		await expect(runStart({})).rejects.toThrow("process.exit called");
		expect(loggerErrorSpy).toHaveBeenCalledWith("Failed resolution");

		vi.spyOn(resolveUtil, "resolveEntry").mockImplementation(() => {
			throw "Non error value";
		});
		await expect(runStart({})).rejects.toThrow("process.exit called");
		expect(loggerErrorSpy).toHaveBeenCalledWith("Non error value");
	});

	it("should exit 1 when entry file does not exist in build", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(false);

		await expect(runStart({})).rejects.toThrow("process.exit called");
		expect(loggerErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("No production build found"),
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("should exit 1 when an invalid port range or non-integer is passed", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);

		await expect(runStart({ port: "70000" })).rejects.toThrow(
			"process.exit called",
		);
		expect(loggerErrorSpy).toHaveBeenCalledWith('Invalid port: "70000"');

		await expect(runStart({ port: "-1" })).rejects.toThrow(
			"process.exit called",
		);
		await expect(runStart({ port: "abc" })).rejects.toThrow(
			"process.exit called",
		);
	});

	it("should format host 0.0.0.0, ::, and ::0 to localhost", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(portUtil, "resolvePort").mockResolvedValue(3000);

		await runStart({ host: "0.0.0.0", port: "3000" });
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			"Starting production server on http://localhost:3000",
		);

		await runStart({ host: "::", port: "3000" });
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			"Starting production server on http://localhost:3000",
		);

		await runStart({ host: "::0", port: "3000" });
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			"Starting production server on http://localhost:3000",
		);
	});

	it("should format IPv6 with brackets only when not already bracketed", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(portUtil, "resolvePort").mockResolvedValue(9000);

		await runStart({ host: "::1", port: "9000" });
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			"Starting production server on http://[::1]:9000",
		);

		await runStart({ host: "[::1]", port: "9000" });
		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			"Starting production server on http://[::1]:9000",
		);
	});

	it("should resolve a root-level entry and use the default fallback port", async () => {
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(resolveUtil, "resolveEntry").mockReturnValue("/app/index.ts");
		vi.spyOn(loadConfig, "findAndLoadConfig").mockResolvedValue({
			entry: "index.ts",
		} as any);
		vi.spyOn(portUtil, "resolvePort").mockResolvedValue(8080);

		await runStart({ host: "[::1]" });

		expect(loggerSuccessSpy).toHaveBeenCalledWith(
			"Starting production server on http://[::1]:8080",
		);
	});
});
