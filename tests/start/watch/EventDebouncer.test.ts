import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventDebouncer } from "../../../start/watch/EventDebouncer.js";
import type { NormalizedWatchEvent } from "../../../start/types/index.types.js";

describe("EventDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should debounce rapid events and flush unique paths together", async () => {
    const onFlush = vi.fn();
    const debouncer = new EventDebouncer(50, onFlush);

    const ev1: NormalizedWatchEvent = { type: "change", path: "/a.ts", timestamp: 1 };
    const ev2: NormalizedWatchEvent = { type: "change", path: "/a.ts", timestamp: 2 };
    const ev3: NormalizedWatchEvent = { type: "add", path: "/b.ts", timestamp: 3 };

    debouncer.add([ev1]);
    debouncer.add([ev2, ev3]);

    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([ev2, ev3]);
  });

  it("should flush immediately when flush() is invoked manually", async () => {
    const onFlush = vi.fn();
    const debouncer = new EventDebouncer(100, onFlush);

    debouncer.add([{ type: "unlink", path: "/del.ts", timestamp: 1 }]);
    await debouncer.flush();

    expect(onFlush).toHaveBeenCalledTimes(1);

    // Subsequent tick should not trigger duplicate
    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("should cancel scheduled flush without invoking handler", () => {
    const onFlush = vi.fn();
    const debouncer = new EventDebouncer(50, onFlush);

    debouncer.add([{ type: "change", path: "/file.ts", timestamp: 1 }]);
    debouncer.cancel();

    vi.advanceTimersByTime(100);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("should ignore additions and flushes once disposed", async () => {
    const onFlush = vi.fn();
    const debouncer = new EventDebouncer(50, onFlush);

    debouncer.dispose();
    debouncer.add([{ type: "change", path: "/file.ts", timestamp: 1 }]);
    await debouncer.flush();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it("should enforce a minimum debounce delay of 10ms", () => {
    const debouncer = new EventDebouncer(2, vi.fn());
    expect((debouncer as any).debounceMs).toBe(10);
  });
});