import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { ServerResponse } from "node:http";
import { streamResponse } from "../../../package/core/http/streams/services/streamResponse.service.js";
import * as pipelineServiceModule from "../../../package/core/http/streams/services/pipeline.service.js";

describe("streamResponse", () => {
    function createMockResponse(overrides: Partial<ServerResponse> = {}) {
        return {
            headersSent: false,
            statusCode: 200,
            setHeader: vi.fn(),
            ...overrides,
        } as unknown as ServerResponse;
    }

    it("should set status, contentType, contentLength, and extra headers before piping", async () => {
        const res = createMockResponse();
        const source = new PassThrough();

        const pipeSpy = vi
            .spyOn(pipelineServiceModule, "pipeToResponse")
            .mockResolvedValue(undefined);

        await streamResponse(res, source, {
            status: 201,
            contentType: "application/json",
            contentLength: 42,
            headers: {
                "X-Custom-Header": "Subatom",
                "Cache-Control": "no-cache",
            },
        });

        expect(res.statusCode).toBe(201);
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
        expect(res.setHeader).toHaveBeenCalledWith("Content-Length", 42);
        expect(res.setHeader).toHaveBeenCalledWith("X-Custom-Header", "Subatom");
        expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
        expect(pipeSpy).toHaveBeenCalledWith(res, source, expect.any(Object));
    });

    it("should not set headers if headersSent is true", async () => {
        const res = createMockResponse({ headersSent: true });
        const source = new PassThrough();

        const pipeSpy = vi
            .spyOn(pipelineServiceModule, "pipeToResponse")
            .mockResolvedValue(undefined);

        await streamResponse(res, source, {
            status: 200,
            contentType: "text/plain",
        });

        expect(res.setHeader).not.toHaveBeenCalled();
        expect(pipeSpy).toHaveBeenCalledWith(res, source, expect.any(Object));
    });
});