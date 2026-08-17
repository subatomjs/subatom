import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../package/watch-engine/utils/logger.js";

describe("logger utility", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("logs info messages with [subatom] tag", () => {
		logger.info("server starting");
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy.mock.calls[0][0]).toContain("[subatom]");
		expect(logSpy.mock.calls[0][0]).toContain("server starting");
	});

	it("logs success messages with [subatom] tag", () => {
		logger.success("build completed");
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy.mock.calls[0][0]).toContain("[subatom]");
		expect(logSpy.mock.calls[0][0]).toContain("build completed");
	});

	it("logs warning messages with [subatom] tag", () => {
		logger.warn("port occupied");
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy.mock.calls[0][0]).toContain("[subatom]");
		expect(logSpy.mock.calls[0][0]).toContain("port occupied");
	});

	it("logs error messages to stderr with [subatom] tag", () => {
		logger.error("fatal crash");
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy.mock.calls[0][0]).toContain("[subatom]");
		expect(errorSpy.mock.calls[0][0]).toContain("fatal crash");
	});
});
