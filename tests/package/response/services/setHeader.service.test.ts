import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {  assertNoHeaderInjection,
    setHeader, } from "../../../../package/core/http/response/services/setHeader.service.js";



describe("setHeader.service", () => {
    function createMockServerResponse() {
        return {
            setHeader: vi.fn(),
        } as unknown as ServerResponse;
    }

    describe("assertNoHeaderInjection", () => {
        it("should allow safe header values", () => {
            expect(() =>
                assertNoHeaderInjection("X-Custom", "safe-value-123"),
            ).not.toThrow();
        });

        it("should throw SubatomError if CR (\\r) is present", () => {
            expect(() =>
                assertNoHeaderInjection("X-Custom", "invalid\rvalue"),
            ).toThrowError(/Refusing to set header "X-Custom"/);
        });

        it("should throw SubatomError if LF (\\n) is present", () => {
            expect(() =>
                assertNoHeaderInjection("X-Custom", "invalid\nvalue"),
            ).toThrowError(/Refusing to set header "X-Custom"/);
        });

        it("should throw SubatomError if CRLF (\\r\\n) is present", () => {
            expect(() =>
                assertNoHeaderInjection("X-Custom", "invalid\r\nvalue"),
            ).toThrowError(/Refusing to set header "X-Custom"/);
        });
    });

    describe("setHeader", () => {
        it("should log a warning and return early if headersSent is true", () => {
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            const raw = createMockServerResponse();
            const headersMap = new Map<string, string | string[]>();

            setHeader(raw, headersMap, true, "X-Test", "value");

            expect(warnSpy).toHaveBeenCalledWith(
                "[Subatom Warning]: Cannot set headers after they are sent to the client.",
            );
            expect(raw.setHeader).not.toHaveBeenCalled();
            expect(headersMap.size).toBe(0);
            warnSpy.mockRestore();
        });

        it("should do nothing if value is undefined when setting single header", () => {
            const raw = createMockServerResponse();
            const headersMap = new Map<string, string | string[]>();

            setHeader(raw, headersMap, false, "X-Test", undefined);

            expect(raw.setHeader).not.toHaveBeenCalled();
            expect(headersMap.size).toBe(0);
        });

        it("should set a single string header", () => {
            const raw = createMockServerResponse();
            const headersMap = new Map<string, string | string[]>();

            setHeader(raw, headersMap, false, "Content-Type", "application/json");

            expect(headersMap.get("content-type")).toBe("application/json");
            expect(raw.setHeader).toHaveBeenCalledWith(
                "Content-Type",
                "application/json",
            );
        });

        it("should set an array of header values and validate all elements against injection", () => {
            const raw = createMockServerResponse();
            const headersMap = new Map<string, string | string[]>();

            setHeader(raw, headersMap, false, "Accept", ["text/html", "text/plain"]);

            expect(headersMap.get("accept")).toEqual(["text/html", "text/plain"]);
            expect(raw.setHeader).toHaveBeenCalledWith("Accept", [
                "text/html",
                "text/plain",
            ]);
        });

        it("should throw if any array element contains CRLF", () => {
            const raw = createMockServerResponse();
            const headersMap = new Map<string, string | string[]>();

            expect(() =>
                setHeader(raw, headersMap, false, "Accept", [
                    "text/html",
                    "text/plain\r\nInjected: evil",
                ]),
            ).toThrowError(/Refusing to set header "Accept"/);
        });

        it("should recursively set headers when given a Record object", () => {
            const raw = createMockServerResponse();
            const headersMap = new Map<string, string | string[]>();

            setHeader(raw, headersMap, false, {
                "X-Custom-1": "val1",
                "X-Custom-2": ["val2a", "val2b"],
            });

            expect(headersMap.get("x-custom-1")).toBe("val1");
            expect(headersMap.get("x-custom-2")).toEqual(["val2a", "val2b"]);
            expect(raw.setHeader).toHaveBeenCalledWith("X-Custom-1", "val1");
            expect(raw.setHeader).toHaveBeenCalledWith("X-Custom-2", [
                "val2a",
                "val2b",
            ]);
        });
    });
});