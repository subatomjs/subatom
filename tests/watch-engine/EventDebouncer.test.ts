import { describe, expect, it, vi } from "vitest";
import { EventDebouncer } from "../../package/watch-engine/watch/EventDebouncer.js";
import type { NormalizedWatchEvent } from "../../package/types/engine-utils/WatchConfig.js";

describe("EventDebouncer", () => {
    it("batches and deduplicates rapid events on the same file", async () => {
        const onFlush = vi.fn();
        const debouncer = new EventDebouncer(50, onFlush);

        const event1: NormalizedWatchEvent = { type: "change", path: "/workspace/a.ts", timestamp: 1 };
        const event2: NormalizedWatchEvent = { type: "change", path: "/workspace/a.ts", timestamp: 2 };
        const event3: NormalizedWatchEvent = { type: "change", path: "/workspace/b.ts", timestamp: 3 };

        debouncer.add([event1]);
        debouncer.add([event2, event3]);

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(onFlush).toHaveBeenCalledTimes(1);
        const batch = onFlush.mock.calls[0][0] as NormalizedWatchEvent[];
        expect(batch).toHaveLength(2);
        expect(batch.map((e) => e.path)).toEqual(["/workspace/a.ts", "/workspace/b.ts"]);
    });

    it("cancels pending batches when requested", async () => {
        const onFlush = vi.fn();
        const debouncer = new EventDebouncer(50, onFlush);

        debouncer.add([{ type: "change", path: "/workspace/a.ts", timestamp: 1 }]);
        debouncer.cancel();

        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(onFlush).not.toHaveBeenCalled();
    });
});