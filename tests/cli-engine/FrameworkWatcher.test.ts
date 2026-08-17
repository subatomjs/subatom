import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameworkWatcher } from "../../package/cli-engine/watch/FrameworkWatcher.js";

const { mockSubscribe } = vi.hoisted(() => ({
    mockSubscribe: vi.fn(),
}));

vi.mock("@parcel/watcher", () => ({
    default: {
        subscribe: mockSubscribe,
    },
    subscribe: mockSubscribe,
}));

describe("FrameworkWatcher (Multi-root Enterprise Watcher)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("subscribes to all unique provided watch directories recursively", async () => {
        const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
        mockSubscribe.mockResolvedValue({
            unsubscribe: mockUnsubscribe,
        });

        const fwWatcher = new FrameworkWatcher({
            watchPaths: ["/app/packages/core", "/app/packages/cli"],
            debounceMs: 100,
            onChange: vi.fn(),
        });

        await fwWatcher.start();

        expect(mockSubscribe).toHaveBeenCalledTimes(2);
        await fwWatcher.close();
        expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
    });

    it("filters out irrelevant files and triggers debounced onChange only on allowed extensions", async () => {
        let callbackHandler: (err: Error | null, events: Array<{ path: string }>) => void = () => {};

        mockSubscribe.mockImplementation((_dir: any, cb: any) => {
            callbackHandler = cb;
            return Promise.resolve({ unsubscribe: vi.fn().mockResolvedValue(undefined) });
        });

        const onChange = vi.fn();
        const fwWatcher = new FrameworkWatcher({
            watchPaths: ["/app"],
            extensions: ["ts", "json"],
            debounceMs: 200,
            onChange,
        });

        await fwWatcher.start();

        // Irrelevant extension (.md)
        callbackHandler(null, [{ path: "/app/README.md" }]);
        await vi.advanceTimersByTimeAsync(300);
        expect(onChange).not.toHaveBeenCalled();

        // Relevant extension (.ts)
        callbackHandler(null, [{ path: "/app/src/index.ts" }]);
        expect(onChange).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(200);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith("/app/src/index.ts");

        await fwWatcher.close();
    });

    it("debounces rapid consecutive changes into a single notification", async () => {
        let callbackHandler: (err: Error | null, events: Array<{ path: string }>) => void = () => {};

        mockSubscribe.mockImplementation((_dir: any, cb: any) => {
            callbackHandler = cb;
            return Promise.resolve({ unsubscribe: vi.fn().mockResolvedValue(undefined) });
        });

        const onChange = vi.fn();
        const fwWatcher = new FrameworkWatcher({
            watchPaths: ["/app"],
            debounceMs: 150,
            onChange,
        });

        await fwWatcher.start();

        callbackHandler(null, [{ path: "/app/file1.ts" }]);
        await vi.advanceTimersByTimeAsync(50);
        callbackHandler(null, [{ path: "/app/file2.ts" }]);
        await vi.advanceTimersByTimeAsync(50);
        callbackHandler(null, [{ path: "/app/file3.ts" }]);

        await vi.advanceTimersByTimeAsync(150);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith("/app/file3.ts");

        await fwWatcher.close();
    });
});