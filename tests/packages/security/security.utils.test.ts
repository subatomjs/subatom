import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
	isProduction,
	normalizeSecurityConfig,
	setSecurityHeader,
	removeSecurityHeader,
	validateDirectiveName,
	isValidOrigin,
} from "../../../packages/security/security.utils.js";
import { InvalidDirectiveError } from "../../../packages/errors/SecurityErrors.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";

declare const process: {
	env: Record<string, string | undefined>;
};

describe("Security Utilities", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("isProduction", () => {
		test("returns true when NODE_ENV is production", () => {
			process.env.NODE_ENV = "production";
			expect(isProduction()).toBe(true);
		});

		test("returns false when NODE_ENV is not production", () => {
			process.env.NODE_ENV = "development";
			expect(isProduction()).toBe(false);

			delete process.env.NODE_ENV;
			expect(isProduction()).toBe(false);
		});
	});

	describe("normalizeSecurityConfig", () => {
		interface MockConfig {
			enabled: boolean;
			level: number;
		}
		const defaultConfig: MockConfig = { enabled: true, level: 1 };

		test("returns false when userConfig is false", () => {
			expect(normalizeSecurityConfig(defaultConfig, false)).toBe(false);
		});

		test("returns a copy of defaultConfig when userConfig is true or undefined", () => {
			const resTrue = normalizeSecurityConfig(defaultConfig, true);
			expect(resTrue).toEqual(defaultConfig);
			expect(resTrue).not.toBe(defaultConfig);

			const resUndef = normalizeSecurityConfig(defaultConfig, undefined);
			expect(resUndef).toEqual(defaultConfig);
			expect(resUndef).not.toBe(defaultConfig);
		});

		test("merges userConfig with defaultConfig when an object is provided", () => {
			const res = normalizeSecurityConfig(defaultConfig, { level: 5 });
			expect(res).toEqual({ enabled: true, level: 5 });
		});
	});

	describe("setSecurityHeader", () => {
		test("does not crash if res is null or missing setHeader", () => {
			expect(() =>
				setSecurityHeader(null as unknown as IResponse, "X-Test", "1"),
			).not.toThrow();
			expect(() =>
				setSecurityHeader({} as unknown as IResponse, "X-Test", "1"),
			).not.toThrow();
		});

		test("skips header setting if headersSent is true", () => {
			const setHeader = vi.fn();
			const res = {
				headersSent: true,
				setHeader,
			} as unknown as IResponse;

			setSecurityHeader(res, "X-Test", "value");
			expect(setHeader).not.toHaveBeenCalled();
		});

		test("sets string value on response", () => {
			const setHeader = vi.fn();
			const res = {
				headersSent: false,
				setHeader,
			} as unknown as IResponse;

			setSecurityHeader(res, "X-Test", "my-value");
			expect(setHeader).toHaveBeenCalledWith("X-Test", "my-value");
		});

		test("sets array value directly on response", () => {
			const setHeader = vi.fn();
			const res = {
				headersSent: false,
				setHeader,
			} as unknown as IResponse;

			setSecurityHeader(res, "X-Test", ["val1", "val2"] as unknown as string);
			expect(setHeader).toHaveBeenCalledWith("X-Test", ["val1", "val2"]);
		});
	});

	describe("removeSecurityHeader", () => {
		test("does not crash if res is null or missing removeHeader", () => {
			expect(() =>
				removeSecurityHeader(null as unknown as IResponse, "X-Test"),
			).not.toThrow();
			expect(() =>
				removeSecurityHeader({} as unknown as IResponse, "X-Test"),
			).not.toThrow();
		});

		test("skips header removal if headersSent is true", () => {
			const removeHeader = vi.fn();
			const res = {
				headersSent: true,
				removeHeader,
			} as unknown as IResponse;

			removeSecurityHeader(res, "X-Powered-By");
			expect(removeHeader).not.toHaveBeenCalled();
		});

		test("removes header when headersSent is false", () => {
			const removeHeader = vi.fn();
			const res = {
				headersSent: false,
				removeHeader,
			} as unknown as IResponse;

			removeSecurityHeader(res, "X-Powered-By");
			expect(removeHeader).toHaveBeenCalledWith("X-Powered-By");
		});
	});

	describe("validateDirectiveName", () => {
		test("passes for valid alphanumeric and hyphenated directive names", () => {
			expect(() => validateDirectiveName("default-src")).not.toThrow();
			expect(() => validateDirectiveName("script-src-elem")).not.toThrow();
			expect(() => validateDirectiveName("camera")).not.toThrow();
		});

		test("throws InvalidDirectiveError for empty, non-string, or invalid characters", () => {
			expect(() => validateDirectiveName("")).toThrow(InvalidDirectiveError);
			expect(() => validateDirectiveName(null as unknown as string)).toThrow(
				InvalidDirectiveError,
			);
			expect(() => validateDirectiveName("script_src")).toThrow(
				InvalidDirectiveError,
			);
			expect(() => validateDirectiveName("script;src")).toThrow(
				InvalidDirectiveError,
			);
		});
	});

	describe("isValidOrigin", () => {
		test("returns true for CSP keyword origins", () => {
			expect(isValidOrigin("'self'")).toBe(true);
			expect(isValidOrigin("'none'")).toBe(true);
			expect(isValidOrigin("*")).toBe(true);
			expect(isValidOrigin("'unsafe-inline'")).toBe(true);
			expect(isValidOrigin("'unsafe-eval'")).toBe(true);
		});

		test("returns true for valid origin patterns", () => {
			expect(isValidOrigin("https://example.com")).toBe(true);
			expect(isValidOrigin("http://localhost:3000")).toBe(true);
			expect(isValidOrigin("example.com")).toBe(true);
			expect(isValidOrigin("sub.domain.org:8080")).toBe(true);
		});

		test("returns false for invalid origin patterns", () => {
			expect(isValidOrigin("https://invalid site.com")).toBe(false);
			expect(isValidOrigin("http://example.com:port")).toBe(false);
		});
	});
});
