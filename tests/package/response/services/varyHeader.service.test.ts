import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { varyHeader } from "../../../../package/core/http/response/services/varyHeader.service.js";

describe("varyHeader.service", () => {
  function createMockServerResponse() {
    return {
      setHeader: vi.fn(),
    } as unknown as ServerResponse;
  }

  it("should create new Vary header when no existing Vary is set", () => {
    const raw = createMockServerResponse();
    const headersMap = new Map<string, string | string[]>();

    varyHeader(raw, headersMap, false, "Accept-Encoding");

    expect(headersMap.get("vary")).toBe("Accept-Encoding");
    expect(raw.setHeader).toHaveBeenCalledWith("Vary", "Accept-Encoding");
  });

  it("should append unique field to existing Vary header string", () => {
    const raw = createMockServerResponse();
    const headersMap = new Map<string, string | string[]>([
      ["vary", "Accept-Encoding"],
    ]);

    varyHeader(raw, headersMap, false, "User-Agent");

    expect(headersMap.get("vary")).toBe("Accept-Encoding, User-Agent");
    expect(raw.setHeader).toHaveBeenCalledWith(
      "Vary",
      "Accept-Encoding, User-Agent",
    );
  });

  it("should deduplicate existing values in Vary header", () => {
    const raw = createMockServerResponse();
    const headersMap = new Map<string, string | string[]>([
      ["vary", "Accept-Encoding, User-Agent"],
    ]);

    varyHeader(raw, headersMap, false, "Accept-Encoding");

    expect(headersMap.get("vary")).toBe("Accept-Encoding, User-Agent");
  });

  it("should handle existing array of Vary headers properly", () => {
    const raw = createMockServerResponse();
    const headersMap = new Map<string, string | string[]>([
      ["vary", ["Accept-Encoding", "Origin"]],
    ]);

    varyHeader(raw, headersMap, false, "User-Agent");

    expect(headersMap.get("vary")).toBe("Accept-Encoding, Origin, User-Agent");
  });
});
