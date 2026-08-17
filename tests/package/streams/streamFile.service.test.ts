import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fsPromises from "node:fs/promises";
import * as fs from "node:fs";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
    parseRange,
    streamFileToResponse,
} from "../../../package/core/http/streams/services/streamFile.service.js";
import { RangeNotSatisfiableError } from "../../../package/types/http/IStream.js";
import * as pipelineModule from "../../../package/core/http/streams/services/pipeline.service.js";

vi.mock("node:fs/promises");
vi.mock("node:fs");




vi.mock("node:fs/promises");
vi.mock("node:fs");

describe("streamFile.service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("parseRange", () => {
        const FILE_SIZE = 1000;

        it("should return null for undefined, empty, or non-byte range headers", () => {
            expect(parseRange(undefined, FILE_SIZE)).toBeNull();
            expect(parseRange("", FILE_SIZE)).toBeNull();
            expect(parseRange("items=0-10", FILE_SIZE)).toBeNull();
        });

        it("should parse standard start-end ranges", () => {
            expect(parseRange("bytes=0-499", FILE_SIZE)).toEqual({ start: 0, end: 499 });
            expect(parseRange("bytes=500-999", FILE_SIZE)).toEqual({ start: 500, end: 999 });
        });

        it("should parse open-ended start- ranges", () => {
            expect(parseRange("bytes=500-", FILE_SIZE)).toEqual({ start: 500, end: 999 });
        });

        it("should parse suffix ranges (-suffixLength)", () => {
            expect(parseRange("bytes=-200", FILE_SIZE)).toEqual({ start: 800, end: 999 });
        });

        it("should cap suffix range start at 0 if suffix exceeds file size", () => {
            expect(parseRange("bytes=-1500", FILE_SIZE)).toEqual({ start: 0, end: 999 });
        });

        it("should cap end at size - 1 if end exceeds file size", () => {
            expect(parseRange("bytes=500-2000", FILE_SIZE)).toEqual({ start: 500, end: 999 });
        });

        it("should throw RangeNotSatisfiableError for multi-range headers", () => {
            expect(() => parseRange("bytes=0-100,200-300", FILE_SIZE)).toThrow(
                RangeNotSatisfiableError,
            );
        });

        it("should throw RangeNotSatisfiableError for invalid ranges", () => {
            expect(() => parseRange("bytes=500-200", FILE_SIZE)).toThrow(RangeNotSatisfiableError);
            expect(() => parseRange("bytes=-0", FILE_SIZE)).toThrow(RangeNotSatisfiableError);
            expect(() => parseRange("bytes=abc-def", FILE_SIZE)).toThrow(RangeNotSatisfiableError);
            expect(() => parseRange("bytes=-abc", FILE_SIZE)).toThrow(RangeNotSatisfiableError);
            expect(() => parseRange("bytes=2000-3000", FILE_SIZE)).toThrow(RangeNotSatisfiableError);
        });
    });

    describe("streamFileToResponse", () => {
        function createMocks() {
            const req = {
                headers: {},
            } as IncomingMessage;

            const res = {
                statusCode: 200,
                setHeader: vi.fn(),
                end: vi.fn(),
            } as unknown as ServerResponse;

            return { req, res };
        }

        it("should stream entire file when no range is requested", async () => {
            const { req, res } = createMocks();
            const fakeReadStream = new PassThrough();

            vi.spyOn(fsPromises, "stat").mockResolvedValue({ size: 2048 } as any);
            vi.spyOn(fs, "createReadStream").mockReturnValue(fakeReadStream as any);
            const pipeSpy = vi
                .spyOn(pipelineModule, "pipeToResponse")
                .mockResolvedValue(undefined);

            await streamFileToResponse(req, res, "/videos/demo.mp4", {
                contentType: "video/mp4",
                headers: { "Cache-Control": "public, max-age=3600" },
            });

            expect(res.statusCode).toBe(200);
            expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "video/mp4");
            expect(res.setHeader).toHaveBeenCalledWith("Accept-Ranges", "bytes");
            expect(res.setHeader).toHaveBeenCalledWith("Content-Length", 2048);
            expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=3600");
            expect(pipeSpy).toHaveBeenCalledWith(res, fakeReadStream, expect.any(Object));
        });

        it("should respond 206 Partial Content when a valid range header is supplied", async () => {
            const { req, res } = createMocks();
            req.headers["range"] = "bytes=0-499";
            const fakeReadStream = new PassThrough();

            vi.spyOn(fsPromises, "stat").mockResolvedValue({ size: 2048 } as any);
            const createReadStreamSpy = vi
                .spyOn(fs, "createReadStream")
                .mockReturnValue(fakeReadStream as any);
            const pipeSpy = vi
                .spyOn(pipelineModule, "pipeToResponse")
                .mockResolvedValue(undefined);

            await streamFileToResponse(req, res, "/videos/demo.mp4");

            expect(res.statusCode).toBe(206);
            expect(res.setHeader).toHaveBeenCalledWith("Content-Range", "bytes 0-499/2048");
            expect(res.setHeader).toHaveBeenCalledWith("Content-Length", 500);
            expect(createReadStreamSpy).toHaveBeenCalledWith("/videos/demo.mp4", {
                start: 0,
                end: 499,
            });
            expect(pipeSpy).toHaveBeenCalledWith(res, fakeReadStream, expect.any(Object));
        });

        it("should respond 416 with Content-Range bytes */<size> when range is unsatisfiable", async () => {
            const { req, res } = createMocks();
            req.headers["range"] = "bytes=500-200";

            vi.spyOn(fsPromises, "stat").mockResolvedValue({ size: 1000 } as any);
            const pipeSpy = vi.spyOn(pipelineModule, "pipeToResponse");

            await streamFileToResponse(req, res, "/file.txt");

            expect(res.statusCode).toBe(416);
            expect(res.setHeader).toHaveBeenCalledWith("Content-Range", "bytes */1000");
            expect(res.end).toHaveBeenCalledTimes(1);
            expect(pipeSpy).not.toHaveBeenCalled();
        });
    });
});