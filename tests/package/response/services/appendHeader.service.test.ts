/// <reference types="node" />
import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { appendHeader } from "../../../../package/core/http/response/services/appendHeader.service.js";



describe("appendHeader.service", () => {
    function createMockServerResponse() {
        return {
            setHeader: vi.fn(),
        } as unknown as ServerResponse;
    }

    it("should set header directly if it does not already exist (single string)", () => {
        const raw = createMockServerResponse();
        const headersMap = new Map<string, string | string[]>();

        appendHeader(raw, headersMap, false, "Set-Cookie", "sessionId=123");

        expect(headersMap.get("set-cookie")).toBe("sessionId=123");
        expect(raw.setHeader).toHaveBeenCalledWith("Set-Cookie", "sessionId=123");
    });

    it("should set header directly if it does not already exist (incoming array)", () => {
        const raw = createMockServerResponse();
        const headersMap = new Map<string, string | string[]>();

        appendHeader(raw, headersMap, false, "Set-Cookie", ["c1=v1", "c2=v2"]);

        expect(headersMap.get("set-cookie")).toEqual(["c1=v1", "c2=v2"]);
        expect(raw.setHeader).toHaveBeenCalledWith("Set-Cookie", ["c1=v1", "c2=v2"]);
    });

    it("should append single string to existing single string header", () => {
        const raw = createMockServerResponse();
        const headersMap = new Map<string, string | string[]>([
            ["set-cookie", "c1=v1"],
        ]);

        appendHeader(raw, headersMap, false, "Set-Cookie", "c2=v2");

        expect(headersMap.get("set-cookie")).toEqual(["c1=v1", "c2=v2"]);
        expect(raw.setHeader).toHaveBeenCalledWith("Set-Cookie", ["c1=v1", "c2=v2"]);
    });

    it("should append array of strings to existing array of strings", () => {
        const raw = createMockServerResponse();
        const headersMap = new Map<string, string | string[]>([
            ["set-cookie", ["c1=v1", "c2=v2"]],
        ]);

        appendHeader(raw, headersMap, false, "Set-Cookie", ["c3=v3", "c4=v4"]);

        expect(headersMap.get("set-cookie")).toEqual([
            "c1=v1",
            "c2=v2",
            "c3=v3",
            "c4=v4",
        ]);
        expect(raw.setHeader).toHaveBeenCalledWith("Set-Cookie", [
            "c1=v1",
            "c2=v2",
            "c3=v3",
            "c4=v4",
        ]);
    });
});