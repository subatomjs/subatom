import { describe, it, expect, vi } from "vitest";
import {
  normalizeHeaderValue,
  isOriginAllowed,
  resolveOrigin,
} from "../../package/core/securities/cross-origin/utils.js";
import type { CorsOrigin } from "../../package/types/securities/ICors.js";

describe("CORS Utils - Unit Tests", () => {
  describe("normalizeHeaderValue", () => {
    it("should return empty string when value is undefined", () => {
      expect(normalizeHeaderValue(undefined)).toBe("");
    });

    it("should return empty string when value is empty string", () => {
      expect(normalizeHeaderValue("")).toBe("");
    });

    it("should trim string values", () => {
      expect(normalizeHeaderValue("  Content-Type  ")).toBe("Content-Type");
    });

    it("should join array items with commas, trimming whitespace and filtering empty elements", () => {
      const input = [" GET ", "POST ", "", "   ", "DELETE"];
      expect(normalizeHeaderValue(input)).toBe("GET,POST,DELETE");
    });

    it("should return empty string for empty array or array with only whitespace", () => {
      expect(normalizeHeaderValue([])).toBe("");
      expect(normalizeHeaderValue([" ", "   "])).toBe("");
    });
  });

  describe("isOriginAllowed", () => {
    it("should match exact string origins", () => {
      expect(
        isOriginAllowed("https://subatom.dev", "https://subatom.dev"),
      ).toBe(true);
      expect(isOriginAllowed("https://other.dev", "https://subatom.dev")).toBe(
        false,
      );
    });

    it("should match RegExp origins", () => {
      const regex = /^https:\/\/.*\.subatom\.dev$/;
      expect(isOriginAllowed("https://api.subatom.dev", regex)).toBe(true);
      expect(isOriginAllowed("https://subatom.dev", regex)).toBe(false);
      expect(isOriginAllowed("http://api.subatom.dev", regex)).toBe(false);
    });

    it("should return false when allowedOrigin is neither string nor RegExp", () => {
      expect(isOriginAllowed("https://subatom.dev", null as any)).toBe(false);
      expect(isOriginAllowed("https://subatom.dev", 123 as any)).toBe(false);
      expect(isOriginAllowed("https://subatom.dev", {} as any)).toBe(false);
    });
  });

  describe("resolveOrigin", () => {
    describe("Undefined / Wildcard / Missing Origin Boundaries", () => {
      it("should return false when requestOrigin is undefined and originConfig is undefined", async () => {
        const result = await resolveOrigin(undefined, undefined);
        expect(result).toBe(false);
      });

      it("should return '*' when requestOrigin is undefined but originConfig is '*'", async () => {
        const result = await resolveOrigin(undefined, "*");
        expect(result).toBe("*");
      });

      it("should return false when requestOrigin is present but originConfig is undefined", async () => {
        const result = await resolveOrigin("https://example.com", undefined);
        expect(result).toBe(false);
      });

      it("should return '*' when requestOrigin is present and originConfig is '*'", async () => {
        const result = await resolveOrigin("https://example.com", "*");
        expect(result).toBe("*");
      });
    });

    describe("Boolean Configuration", () => {
      it("should return true when originConfig is true", async () => {
        const result = await resolveOrigin("https://subatom.dev", true);
        expect(result).toBe(true);
      });

      it("should return false when originConfig is false", async () => {
        const result = await resolveOrigin("https://subatom.dev", false);
        expect(result).toBe(false);
      });
    });

    describe("String Configuration", () => {
      it("should return requestOrigin when string matches exactly", async () => {
        const result = await resolveOrigin(
          "https://subatom.dev",
          "https://subatom.dev",
        );
        expect(result).toBe("https://subatom.dev");
      });

      it("should return false when string does not match", async () => {
        const result = await resolveOrigin(
          "https://evil.com",
          "https://subatom.dev",
        );
        expect(result).toBe(false);
      });
    });

    describe("RegExp Configuration", () => {
      it("should return requestOrigin when regex pattern matches", async () => {
        const regex = /\.subatom\.dev$/;
        const result = await resolveOrigin("https://app.subatom.dev", regex);
        expect(result).toBe("https://app.subatom.dev");
      });

      it("should return false when regex pattern does not match", async () => {
        const regex = /\.subatom\.dev$/;
        const result = await resolveOrigin("https://subatom.com", regex);
        expect(result).toBe(false);
      });
    });

    describe("Array Configuration", () => {
      const allowedList: CorsOrigin = [
        "https://trusted.com",
        /^https:\/\/.*\.subatom\.dev$/,
      ];

      it("should return requestOrigin if any item in the array matches (string match)", async () => {
        const result = await resolveOrigin("https://trusted.com", allowedList);
        expect(result).toBe("https://trusted.com");
      });

      it("should return requestOrigin if any item in the array matches (RegExp match)", async () => {
        const result = await resolveOrigin(
          "https://admin.subatom.dev",
          allowedList,
        );
        expect(result).toBe("https://admin.subatom.dev");
      });

      it("should return false if no items in array match", async () => {
        const result = await resolveOrigin(
          "https://untrusted.com",
          allowedList,
        );
        expect(result).toBe(false);
      });
    });

    describe("Function Configuration", () => {
      describe("Promise / Single-Argument Async Function (length <= 1)", () => {
        it("should return requestOrigin when async resolver resolves true", async () => {
          const customFn = vi
            .fn()
            .mockImplementation(async (origin?: string) => {
              return origin?.endsWith(".subatom.dev") ?? false;
            });

          const result = await resolveOrigin(
            "https://secure.subatom.dev",
            customFn,
          );
          expect(customFn).toHaveBeenCalledWith("https://secure.subatom.dev");
          expect(result).toBe("https://secure.subatom.dev");
        });

        it("should return false when async resolver resolves false", async () => {
          const customFn = vi.fn().mockResolvedValue(false);
          const result = await resolveOrigin(
            "https://unauthorized.dev",
            customFn,
          );
          expect(result).toBe(false);
        });

        it("should support 0-parameter functions (length === 0 <= 1)", async () => {
          const noArgFn = () => true;
          const result = await resolveOrigin(
            "https://subatom.dev",
            noArgFn as any,
          );
          expect(result).toBe("https://subatom.dev");
        });
      });

      describe("Callback-Style Function (length > 1)", () => {
        it("should return requestOrigin when callback is invoked with (null, true)", async () => {
          const callbackFn = (
            origin: string | undefined,
            cb: (err: Error | null, allow?: boolean) => void,
          ) => {
            cb(null, true);
          };

          const result = await resolveOrigin(
            "https://callback.subatom.dev",
            callbackFn as any,
          );
          expect(result).toBe("https://callback.subatom.dev");
        });

        it("should return false when callback is invoked with (null, false)", async () => {
          const callbackFn = (
            origin: string | undefined,
            cb: (err: Error | null, allow?: boolean) => void,
          ) => {
            cb(null, false);
          };

          const result = await resolveOrigin(
            "https://callback.subatom.dev",
            callbackFn as any,
          );
          expect(result).toBe(false);
        });

        it("should return false when callback is invoked with an error", async () => {
          const callbackFn = (
            origin: string | undefined,
            cb: (err: Error | null, allow?: boolean) => void,
          ) => {
            cb(new Error("CORS Security Failure"), false);
          };

          const result = await resolveOrigin(
            "https://error.subatom.dev",
            callbackFn as any,
          );
          expect(result).toBe(false);
        });
      });
    });

    describe("Unsupported Configuration Types", () => {
      it("should return false for unsupported types (numbers, objects)", async () => {
        expect(await resolveOrigin("https://subatom.dev", 12345 as any)).toBe(
          false,
        );
        expect(
          await resolveOrigin("https://subatom.dev", { allow: true } as any),
        ).toBe(false);
      });
    });
  });
});
