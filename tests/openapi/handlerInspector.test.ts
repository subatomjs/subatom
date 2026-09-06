import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFileMetadata } from "../../openapi/handlerInspector.js";
import type { FileMetadata } from "../../openapi/types/openapi.types.js";

describe("handlerInspector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("extractFileMetadata", () => {
    it("should return null if handler is not a function", () => {
      expect(extractFileMetadata(null)).toBeNull();
      expect(extractFileMetadata(undefined)).toBeNull();
      expect(extractFileMetadata("string")).toBeNull();
      expect(extractFileMetadata(42)).toBeNull();
      expect(extractFileMetadata({})).toBeNull();
      expect(extractFileMetadata([])).toBeNull();
    });

    it("should return null if handler has falsy _fileConfig", () => {
      const fnWithoutConfig = () => {};
      expect(extractFileMetadata(fnWithoutConfig)).toBeNull();

      const fnWithUndefined = () => {};
      (fnWithUndefined as any)._fileConfig = undefined;
      expect(extractFileMetadata(fnWithUndefined)).toBeNull();

      const fnWithNull = () => {};
      (fnWithNull as any)._fileConfig = null;
      expect(extractFileMetadata(fnWithNull)).toBeNull();

      const fnWithFalse = () => {};
      (fnWithFalse as any)._fileConfig = false;
      expect(extractFileMetadata(fnWithFalse)).toBeNull();
    });

    it("should return valid FileMetadata for single, array, and fields types", () => {
      const singleFn = () => {};
      const singleConfig: FileMetadata = { type: "single", fieldname: "avatar" };
      (singleFn as any)._fileConfig = singleConfig;
      expect(extractFileMetadata(singleFn)).toEqual(singleConfig);

      const arrayFn = () => {};
      const arrayConfig: FileMetadata = { type: "array", fieldname: "photos", maxCount: 10 };
      (arrayFn as any)._fileConfig = arrayConfig;
      expect(extractFileMetadata(arrayFn)).toEqual(arrayConfig);

      const fieldsFn = () => {};
      const fieldsConfig: FileMetadata = {
        type: "fields",
        fields: [{ name: "doc", maxCount: 1 }],
      };
      (fieldsFn as any)._fileConfig = fieldsConfig;
      expect(extractFileMetadata(fieldsFn)).toEqual(fieldsConfig);
    });

    it("should log warning with handler name and return null for invalid config shape", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      function myNamedHandler() {}
      (myNamedHandler as any)._fileConfig = { type: "unknown-type" };

      expect(extractFileMetadata(myNamedHandler)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Handler has a _fileConfig property"),
        "myNamedHandler",
      );
    });

    it("should log warning with 'anonymous' when handler has empty name", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const anonFn = () => {};
      Object.defineProperty(anonFn, "name", { value: "" });
      (anonFn as any)._fileConfig = { type: "invalid" };

      expect(extractFileMetadata(anonFn)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Handler has a _fileConfig property"),
        "anonymous",
      );
    });

    it("should log warning and return null when _fileConfig is a non-object truthy value", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      function primitiveConfigHandler() {}
      (primitiveConfigHandler as any)._fileConfig = "not-an-object";

      expect(extractFileMetadata(primitiveConfigHandler)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Handler has a _fileConfig property"),
        "primitiveConfigHandler",
      );
    });
  });
});