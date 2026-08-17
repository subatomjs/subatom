import { describe, expect, it } from "vitest";
import type { CompressionAlgorithm } from "../../../package/core/http/compression/index.js";
import { negotiateEncoding } from "../../../package/core/http/compression/negotiate.js";

describe("negotiate.ts - negotiateEncoding", () => {
    const serverAlgorithms: CompressionAlgorithm[] = ["br", "gzip", "deflate"];

    describe("undefined or empty Accept-Encoding header", () => {
        it("picks first non-identity server algorithm when header is undefined", () => {
            const result = negotiateEncoding(undefined, serverAlgorithms);
            expect(result).toEqual({
                algorithm: "br",
                qValue: 1,
                acceptable: true,
            });
        });

        it("picks identity when header is undefined and server only supports identity", () => {
            const result = negotiateEncoding(undefined, ["identity"]);
            expect(result).toEqual({
                algorithm: "identity",
                qValue: 1,
                acceptable: true,
            });
        });

        it("returns identity with q=1 when header is empty or whitespace-only", () => {
            expect(negotiateEncoding("", serverAlgorithms)).toEqual({
                algorithm: "identity",
                qValue: 1,
                acceptable: true,
            });
            expect(negotiateEncoding("   ", serverAlgorithms)).toEqual({
                algorithm: "identity",
                qValue: 1,
                acceptable: true,
            });
        });
    });

    describe("explicit algorithm negotiation and prioritization", () => {
        it("selects the algorithm with the highest qValue", () => {
            const result = negotiateEncoding("gzip;q=0.8, br;q=0.9, deflate;q=0.5", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "br",
                qValue: 0.9,
                acceptable: true,
            });
        });

        it("falls back to server order when qValues are identical", () => {
            const result = negotiateEncoding("gzip, br, deflate", ["gzip", "br", "deflate"]);
            // In iteration order of serverAlgorithms, the first one with max q (1) is kept unless strictly greater
            expect(result.algorithm).toBe("gzip");
            expect(result.acceptable).toBe(true);
        });

        it("handles multiple duplicate entries and preserves the highest qValue", () => {
            const result = negotiateEncoding("gzip;q=0.2, gzip;q=0.9, br;q=0.5", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "gzip",
                qValue: 0.9,
                acceptable: true,
            });
        });

        it("ignores malformed parameters and non-q parameters in header", () => {
            const result = negotiateEncoding("gzip;level=9;q=0.7, br;foo", serverAlgorithms);
            expect(result.algorithm).toBe("br"); // br has default q=1
            expect(result.qValue).toBe(1);
        });

        it("handles entry parts without key/value or with empty elements", () => {
            const result = negotiateEncoding(", , gzip; ;, br", serverAlgorithms);
            expect(result.algorithm).toBe("br");
            expect(result.acceptable).toBe(true);
        });
    });

    describe("wildcard (*) handling", () => {
        it("applies wildcard qValue to supported server algorithms not explicitly listed", () => {
            const result = negotiateEncoding("*;q=0.6, deflate;q=0.2", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "br",
                qValue: 0.6,
                acceptable: true,
            });
        });

        it("rejects when wildcard q=0 and no other algorithm matches", () => {
            const result = negotiateEncoding("*;q=0", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "identity",
                qValue: 0,
                acceptable: false,
            });
        });
    });

    describe("identity negotiation and 406 unacceptable states", () => {
        it("prefers identity when identity has strictly higher qValue than compression algorithms", () => {
            const result = negotiateEncoding("gzip;q=0.5, identity;q=0.8", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "identity",
                qValue: 0.8,
                acceptable: true,
            });
        });

        it("returns acceptable identity if all compression algorithms have q=0 but identity is permitted", () => {
            const result = negotiateEncoding("gzip;q=0, br;q=0, deflate;q=0, identity;q=0.5", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "identity",
                qValue: 0.5,
                acceptable: true,
            });
        });

        it("returns acceptable identity with default q=1 when not explicitly forbidden and compression algorithms are unavailable", () => {
            const result = negotiateEncoding("compress;q=1", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "identity",
                qValue: 1,
                acceptable: true,
            });
        });

        it("returns unacceptable (406) when identity;q=0 and all matching algorithms are q=0", () => {
            const result = negotiateEncoding("gzip;q=0, br;q=0, deflate;q=0, identity;q=0", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "identity",
                qValue: 0,
                acceptable: false,
            });
        });

        it("returns unacceptable when *;q=0 and identity is not explicitly enabled", () => {
            const result = negotiateEncoding("*;q=0", serverAlgorithms);
            expect(result).toEqual({
                algorithm: "identity",
                qValue: 0,
                acceptable: false,
            });
        });
    });
});