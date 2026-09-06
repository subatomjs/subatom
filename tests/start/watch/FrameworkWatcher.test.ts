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

    capturedCallback!(null, [{ path: "/app/src/index.ts", type: "update" }]);
    vi.advanceTimersByTime(50);

    expect(onChange).toHaveBeenCalledWith("/app/src/index.ts");
    await fw.close();
    expect(mockUnsubscribe).toHaveBeenCalled();
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
});