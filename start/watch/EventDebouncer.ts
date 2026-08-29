/**
 * @fileoverview This EventDebouncer class is responsible for collecting multiple file/watch events
 *  that happen within a short time window and processing them together as a single batch.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { NormalizedWatchEvent } from "../types/index.types.js";

export class EventDebouncer {
	private readonly debounceMs: number;
	private readonly onFlush: (
		batch: readonly NormalizedWatchEvent[],
	) => void | Promise<void>;
	private timer: NodeJS.Timeout | null = null;
	private eventMap = new Map<string, NormalizedWatchEvent>();
	private isDisposed = false;

	constructor(
		debounceMs: number,
		onFlush: (batch: readonly NormalizedWatchEvent[]) => void | Promise<void>,
	) {
		this.debounceMs = Math.max(10, debounceMs);
		this.onFlush = onFlush;
	}

	public add(events: readonly NormalizedWatchEvent[]): void {
		if (this.isDisposed || events.length === 0) {
			return;
		}

		for (const event of events) {
			this.eventMap.set(event.path, event);
		}

		if (this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = setTimeout(() => {
			void this.flush();
		}, this.debounceMs);
	}

	public async flush(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		if (this.eventMap.size === 0 || this.isDisposed) {
			return;
		}

		const batch = Array.from(this.eventMap.values());
		this.eventMap.clear();

		await this.onFlush(batch);
	}

	public cancel(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.eventMap.clear();
	}

	public dispose(): void {
		this.isDisposed = true;
		this.cancel();
	}
}
