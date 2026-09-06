import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import watcher, {
  type AsyncSubscription,
  type SubscribeCallback,
  type Options,
} from "@parcel/watcher";
import { FrameworkWatcher } from "../../../start/watch/FrameworkWatcher.js";

vi.mock("@parcel/watcher");

describe("FrameworkWatcher", () => {
  let mockUnsubscribe: Mock<() => Promise<void>>;
  let capturedCallback: SubscribeCallback | null = null;
  let capturedPaths: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    capturedPaths = [];
    capturedCallback = null;
    mockUnsubscribe = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    vi.spyOn(watcher, "subscribe").mockImplementation(
      (
        dir: string,
        fn: SubscribeCallback,
        _opts?: Options,
      ): Promise<AsyncSubscription> => {
        capturedPaths.push(dir);
        capturedCallback = fn;
        return Promise.resolve({
          unsubscribe: mockUnsubscribe,
        });
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should use default options when watchPaths and debounceMs are omitted", async () => {
    const fw = new FrameworkWatcher({
      onChange: vi.fn(),
    });

    await fw.start();
    expect(capturedPaths[0]).toBe(process.cwd());
    await fw.close();
  });

  it("should subscribe to directories and process valid file events", async () => {
    const onChange = vi.fn();
    const fw = new FrameworkWatcher({
      watchPaths: ["/app/src"],
      debounceMs: 50,
      onChange,
    });

    await fw.start();
    expect(capturedPaths).toHaveLength(1);
    expect(capturedCallback).not.toBeNull();

    // Rapid successive events to test debounce clearing
    capturedCallback!(null, [{ path: "/app/src/index.ts", type: "update" }]);
    vi.advanceTimersByTime(25);
    capturedCallback!(null, [{ path: "/app/src/index.ts", type: "update" }]);
    vi.advanceTimersByTime(50);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("/app/src/index.ts");
    await fw.close();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("should ignore empty or undefined events array", async () => {
    const onChange = vi.fn();
    const fw = new FrameworkWatcher({
      watchPaths: ["/app"],
      onChange,
    });

    await fw.start();
    capturedCallback!(null, []);
    capturedCallback!(null, undefined as any);

    vi.advanceTimersByTime(200);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should ignore events when closed or when onError is not provided on error", async () => {
    const onChange = vi.fn();
    const fw = new FrameworkWatcher({
      watchPaths: ["/app"],
      onChange,
    });

    await fw.start();
    capturedCallback!(new Error("Ignored error"), []);

    await fw.close();
    capturedCallback!(null, [{ path: "/app/index.ts", type: "update" }]);
    vi.advanceTimersByTime(200);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should trigger onError when subscription passes an error", async () => {
    const onError = vi.fn();
    const fw = new FrameworkWatcher({
      watchPaths: ["/app"],
      onChange: vi.fn(),
      onError,
    });

    await fw.start();
    const watcherErr = new Error("Subscription failure");
    capturedCallback!(watcherErr, []);

    expect(onError).toHaveBeenCalledWith(watcherErr);
  });

  it("should ignore events matching filter exclusions", async () => {
    const onChange = vi.fn();
    const fw = new FrameworkWatcher({
      watchPaths: ["/app"],
      debounceMs: 20,
      onChange,
    });

    await fw.start();
    capturedCallback!(null, [
      { path: "/app/node_modules/pkg/index.js", type: "update" },
    ]);
    vi.advanceTimersByTime(50);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should not call onChange if watcher is closed before debounce timer fires", async () => {
    const onChange = vi.fn();
    const fw = new FrameworkWatcher({
      watchPaths: ["/app/src"],
      debounceMs: 50,
      onChange,
    });

    await fw.start();
    capturedCallback!(null, [{ path: "/app/src/index.ts", type: "update" }]);

    // Close before the debounce time elapses
    await fw.close();
    vi.advanceTimersByTime(60);

    expect(onChange).not.toHaveBeenCalled();
  });
});