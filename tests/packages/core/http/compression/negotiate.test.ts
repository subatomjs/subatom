import { describe, it, expect } from "vitest";
import { negotiateEncoding } from "../../../../../packages/core/http/compression/negotiate.js";

describe("negotiateEncoding", () => {
  it("should return the first non-identity server algorithm when Accept-Encoding is missing", () => {
    const result = negotiateEncoding(undefined, ["br", "gzip", "deflate"]);
    expect(result).toEqual({
      algorithm: "br",
      qValue: 1,
      acceptable: true,
    });
  });

  it("should return identity if only identity is supported when header is missing", () => {
    const result = negotiateEncoding(undefined, ["identity"]);
    expect(result).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });
  });

  it("should return identity when Accept-Encoding is empty or whitespace", () => {
    expect(negotiateEncoding("", ["gzip"])).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });
    expect(negotiateEncoding("   ", ["gzip"])).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });
  });

  it("should select the algorithm with highest q-value", () => {
    const result = negotiateEncoding("gzip;q=0.5, br;q=0.9, deflate;q=0.8", [
      "gzip",
      "br",
      "deflate",
    ]);
    expect(result).toEqual({
      algorithm: "br",
      qValue: 0.9,
      acceptable: true,
    });
  });

  it("should handle wildcard (*) q-values", () => {
    const result = negotiateEncoding("*;q=0.7", ["gzip", "br"]);
    expect(result).toEqual({
      algorithm: "gzip",
      qValue: 0.7,
      acceptable: true,
    });
  });

  it("should handle explicit identity preference overrides", () => {
    const result = negotiateEncoding("identity;q=1, gzip;q=0.5", ["gzip"]);
    expect(result).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });
  });

  it("should return unacceptable when identity and all algorithms are rejected with q=0", () => {
    const result = negotiateEncoding("gzip;q=0, identity;q=0, *;q=0", ["gzip"]);
    expect(result).toEqual({
      algorithm: "identity",
      qValue: 0,
      acceptable: false,
    });
  });

it("should skip empty or malformed parameters safely", () => {
    const result = negotiateEncoding("gzip;q=0.2;malformed, br;other=val;q=0.8, , ;", [
      "gzip",
      "br",
    ]);
    expect(result).toEqual({
      algorithm: "br",
      qValue: 0.8,
      acceptable: true,
    });
  });
});