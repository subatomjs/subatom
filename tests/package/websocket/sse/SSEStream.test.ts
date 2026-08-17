import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SSEStream } from "../../../../package/core/websocket/sse/SSEStream.js";
import * as abortUtils from "../../../../package/core/http/streams/utils/abort.utils.js";
import * as backpressureUtils from "../../../../package/core/http/streams/utils/backpressure.utils.js";

type Writable<T> = { -readonly [P in keyof T]?: T[P] };

describe("SSEStream", () => {
    let mockResponse: Writable<ServerResponse> & EventEmitter;
    let unbindDisconnectMock: Mock<() => void>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        mockResponse = new EventEmitter() as any;
        mockResponse.headersSent = false;
        mockResponse.writableEnded = false;
        mockResponse.writeHead = vi.fn();
        mockResponse.end = vi.fn().mockImplementation(() => {
            mockResponse.writableEnded = true;
        });

        unbindDisconnectMock = vi.fn<() => void>();
        vi.spyOn(abortUtils, "onClientDisconnect").mockReturnValue(unbindDisconnectMock);
        vi.spyOn(backpressureUtils, "writeWithBackpressure").mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should write 200 SSE headers on construction if headers not yet sent", () => {
        const stream = new SSEStream(mockResponse as unknown as ServerResponse, {
            headers: { "Access-Control-Allow-Origin": "*" },
        });

        expect(mockResponse.writeHead).toHaveBeenCalledWith(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        });

        stream.close();
    });

    it("should enqueue retry instruction if configured in options", async () => {
        const stream = new SSEStream(mockResponse as unknown as ServerResponse, {
            retry: 3000,
            heartbeatInterval: 0,
        });

        await Promise.resolve();

        expect(backpressureUtils.writeWithBackpressure).toHaveBeenCalledWith(
            mockResponse,
            "retry: 3000\n\n",
        );
        stream.close();
    });

    it("should send formatted SSE events and comments respecting backpressure queue", async () => {
        const stream = new SSEStream(mockResponse as unknown as ServerResponse, {
            heartbeatInterval: 0,
        });

        await stream.send({ event: "ping", data: { ok: true } });
        await stream.comment("manual heartbeat");

        expect(backpressureUtils.writeWithBackpressure).toHaveBeenCalledWith(
            mockResponse,
            "event: ping\ndata: {\"ok\":true}\n\n",
        );
        expect(backpressureUtils.writeWithBackpressure).toHaveBeenCalledWith(
            mockResponse,
            ": manual heartbeat\n\n",
        );
        stream.close();
    });

    it("should execute heartbeat comments on configured interval", async () => {
        const stream = new SSEStream(mockResponse as unknown as ServerResponse, {
            heartbeatInterval: 5000,
        });

        await vi.advanceTimersByTimeAsync(5000);

        expect(backpressureUtils.writeWithBackpressure).toHaveBeenCalledWith(
            mockResponse,
            ": heartbeat\n\n",
        );
        stream.close();
    });

    it("should trigger onClose callbacks and clean up resources idempotently", () => {
        const stream = new SSEStream(mockResponse as unknown as ServerResponse, {
            heartbeatInterval: 5000,
        });

        const closeCb1 = vi.fn();
        const closeCb2 = vi.fn();

        stream.onClose(closeCb1);
        const unsubscribe = stream.onClose(closeCb2);
        unsubscribe(); // cb2 should not run

        expect(stream.closed).toBe(false);
        stream.close();

        expect(stream.closed).toBe(true);
        expect(closeCb1).toHaveBeenCalledOnce();
        expect(closeCb2).not.toHaveBeenCalled();
        expect(unbindDisconnectMock).toHaveBeenCalledOnce();
        expect(mockResponse.end).toHaveBeenCalledOnce();

        // Calling close again does nothing (idempotent)
        stream.close();
        expect(closeCb1).toHaveBeenCalledOnce();

        // Registering callback on already-closed stream fires immediately
        const postCloseCb = vi.fn();
        stream.onClose(postCloseCb);
        expect(postCloseCb).toHaveBeenCalledOnce();
    });

    it("should close stream on write error in writeQueue", async () => {
        vi.spyOn(backpressureUtils, "writeWithBackpressure").mockRejectedValue(
            new Error("Client disconnected abruptly"),
        );

        const stream = new SSEStream(mockResponse as unknown as ServerResponse, {
            heartbeatInterval: 0,
        });

        await stream.send({ data: "payload" });

        expect(stream.closed).toBe(true);
    });
});