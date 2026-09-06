import { describe, it, expect, vi } from "vitest";
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

  it("should skip identity in serverAlgorithms loop (line 130)", () => {
    const result = negotiateEncoding("identity;q=0.5, gzip;q=0.8", [
      "identity",
      "gzip",
    ]);
    expect(result).toEqual({
      algorithm: "gzip",
      qValue: 0.8,
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

  it("should skip parameters without = or with names other than q (lines 73, 79)", () => {
    // line 73: separator === -1 (no '=')
    // line 79: name !== 'q' (e.g. 'level=5')
    const result = negotiateEncoding("gzip;noequals;level=5;q=0.9, br;q=0.5", [
      "gzip",
      "br",
    ]);
    expect(result).toEqual({
      algorithm: "gzip",
      qValue: 0.9,
      acceptable: true,
    });
  });
  it("should skip empty parameters and parameters without equals (line 73)", () => {
    // " ; " creates an empty parameter (!parameter)
    // "flag" has no '=' (separator === -1)
    const result = negotiateEncoding("gzip; ;flag;q=0.7", ["gzip"]);
    expect(result).toEqual({
      algorithm: "gzip",
      qValue: 0.7,
      acceptable: true,
    });
  });
  it("should skip empty or malformed parameters safely", () => {
    const result = negotiateEncoding(
      "gzip;q=0.2;malformed, br;other=val;q=0.8, , ;",
      ["gzip", "br"],
    );
    expect(result).toEqual({
      algorithm: "br",
      qValue: 0.8,
      acceptable: true,
    });
  });
  it("should return 0 when algorithm is not in preferences and no wildcard exists (line 122)", () => {
    // Client only requests 'deflate'; server only supports 'gzip' and 'br'
    // This forces getEncodingQ to hit 'return 0' (line 122)
    // And since identity is implicitly acceptable (identityQ = 1), hits line 158
    const result = negotiateEncoding("deflate", ["gzip", "br"]);
    expect(result).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });
  });

  it("should fall back to identity when all supported algorithms have q=0 but identity is allowed (line 158)", () => {
    const result = negotiateEncoding("gzip;q=0, br;q=0", ["gzip", "br"]);
    expect(result).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });
  });
  it("should ignore duplicate encoding entries with equal or lower q-values (lines 90-97)", () => {
    // previous is defined, but q <= previous (0.4 <= 0.8)
    const result = negotiateEncoding("gzip;q=0.8, gzip;q=0.4", ["gzip"]);
    expect(result).toEqual({
      algorithm: "gzip",
      qValue: 0.8,
      acceptable: true,
    });
  });

  it("should set identityQ to 0 when wildcard is 0 without explicit identity (lines 106-107)", () => {
    // *;q=0 without explicit identity -> identityQ evaluates to 0
    // gzip is explicitly allowed with q=0.9
    const result = negotiateEncoding("*;q=0, gzip;q=0.9", ["gzip"]);
    expect(result).toEqual({
      algorithm: "gzip",
      qValue: 0.9,
      acceptable: true,
    });
  });
  it("should overwrite earlier lower q-value when duplicate encoding has higher q-value (line 90)", () => {
    // previous is defined (0.3), and q > previous (0.8 > 0.3) -> evaluates second condition as true
    const result = negotiateEncoding("gzip;q=0.3, gzip;q=0.8", ["gzip"]);
    expect(result).toEqual({
      algorithm: "gzip",
      qValue: 0.8,
      acceptable: true,
    });
  });

  it("should handle explicit identity with zero or lower q-value than best compression (line 106)", () => {
    // hasExplicitIdentity is true (q=0.2), but gzip has higher q (0.8)
    // This exercises the branch where hasExplicitIdentity is evaluated but does not override bestCompression
    const result = negotiateEncoding("identity;q=0.2, gzip;q=0.8", ["gzip"]);
    expect(result).toEqual({
      algorithm: "gzip",
      qValue: 0.8,
      acceptable: true,
    });

    // hasExplicitIdentity is true (q=0), gzip is absent, testing explicit 0 identity
    const resultNoServerComp = negotiateEncoding("identity;q=0", ["gzip"]);
    expect(resultNoServerComp).toEqual({
      algorithm: "identity",
      qValue: 0,
      acceptable: false,
    });
  });

  it("should cover line 90 fallback when q-value is invalid", () => {
    // rawQ is "invalid", parseQValue returns null, taking the "?? 0" branch on line 90
    const result = negotiateEncoding("gzip;q=invalid", ["gzip"]);
    expect(result).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });
  });

  it("should cover all identityQ ternary branches on line 106", () => {
    // 1. hasExplicitIdentity is false, wildcard is absent (wildcardQ === undefined !== 0) -> identityQ = 1
    const resNoWildcard = negotiateEncoding("deflate", ["gzip"]);
    expect(resNoWildcard).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });

    // 2. hasExplicitIdentity is false, wildcard is present and > 0 (wildcardQ === 0.5 !== 0) -> identityQ = 1
    const resWildcardActive = negotiateEncoding("*;q=0.5", ["identity"]);
    expect(resWildcardActive).toEqual({
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    });
  });

  it("should exercise defensive nullish fallback for identityQ (line 106)", () => {
    const originalGet = Map.prototype.get;
    const spy = vi.spyOn(Map.prototype, "get").mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown,
    ) {
      if (key === "identity") {
        return undefined;
      }
      return originalGet.call(this, key);
    });

    try {
      const result = negotiateEncoding("identity", ["gzip"]);
      expect(result).toEqual({
        algorithm: "identity",
        qValue: 0,
        acceptable: false,
      });
    } finally {
      spy.mockRestore();
    }
  });
});
