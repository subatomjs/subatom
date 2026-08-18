import { describe, it, expect } from "vitest";
import {
    SubatomSecurityError,
    InvalidDirectiveError,
    InvalidConfigurationError,
} from "../../package/core/securities/security/security.errors.js";

describe("Subatom Security Error Classes", () => {
    describe("SubatomSecurityError", () => {
        it("should instantiate with correct name, message formatting, and prototype chain", () => {
            const message = "Base security violation";
            const error = new SubatomSecurityError(message);

            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(SubatomSecurityError);
            expect(error.name).toBe("SubatomSecurityError");
            expect(error.message).toBe(`[Subatom Security]: ${message}`);
            expect(error.stack).toBeDefined();
        });
    });

    describe("InvalidDirectiveError", () => {
        it("should inherit from SubatomSecurityError with correct name and prefixed message", () => {
            const message = "Invalid CSP directive 'script-src-invalid'";
            const error = new InvalidDirectiveError(message);

            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(SubatomSecurityError);
            expect(error).toBeInstanceOf(InvalidDirectiveError);
            expect(error.name).toBe("InvalidDirectiveError");
            expect(error.message).toBe(`[Subatom Security]: ${message}`);
        });

        it("should be catchable as a SubatomSecurityError", () => {
            const throwingFn = () => {
                throw new InvalidDirectiveError("Bad directive");
            };

            expect(throwingFn).toThrow(InvalidDirectiveError);
            expect(throwingFn).toThrow(SubatomSecurityError);
            expect(throwingFn).toThrow(Error);
            expect(throwingFn).toThrow("[Subatom Security]: Bad directive");
        });
    });

    describe("InvalidConfigurationError", () => {
        it("should inherit from SubatomSecurityError with correct name and prefixed message", () => {
            const message = "Missing required policy options";
            const error = new InvalidConfigurationError(message);

            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(SubatomSecurityError);
            expect(error).toBeInstanceOf(InvalidConfigurationError);
            expect(error.name).toBe("InvalidConfigurationError");
            expect(error.message).toBe(`[Subatom Security]: ${message}`);
        });

        it("should be catchable as a SubatomSecurityError", () => {
            const throwingFn = () => {
                throw new InvalidConfigurationError("Bad config");
            };

            expect(throwingFn).toThrow(InvalidConfigurationError);
            expect(throwingFn).toThrow(SubatomSecurityError);
            expect(throwingFn).toThrow(Error);
            expect(throwingFn).toThrow("[Subatom Security]: Bad config");
        });
    });
});