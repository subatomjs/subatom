/**
 * @fileoverview Implements an in-memory rate-limit store supporting fixed-window, 
 * sliding-window, and token-bucket algorithms with automatic cache cleanup.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */


import type {
	MemoryStoreEntry,
	RateLimitStore,
	StoreEvalParams,
	StoreEvalResult,
} from "../types/rateLimit.types.js";

export class MemoryStore implements RateLimitStore {
	private cache = new Map<string, MemoryStoreEntry>();
	private gcInterval: NodeJS.Timeout;

	constructor(cleanupMs = 60000) {
		this.gcInterval = setInterval(() => this.cleanup(), cleanupMs);
		if (this.gcInterval.unref) this.gcInterval.unref();
	}

	async evaluate(p: StoreEvalParams): Promise<StoreEvalResult> {
		const entry: MemoryStoreEntry = this.cache.get(p.key) || {
			count: 0,
			resetAt: p.now + p.windowMs,
			tokens: p.capacity,
			lastRefill: p.now,
		};

		if (p.algorithm === "fixed-window") {
			if (p.now > entry.resetAt) {
				entry.count = 0;
				entry.resetAt = p.now + p.windowMs;
			}
			entry.count++;
			const allowed = entry.count <= p.limit;
			const remaining = Math.max(0, p.limit - entry.count);
			this.cache.set(p.key, entry);
			return { allowed, remaining, resetMs: entry.resetAt - p.now };
		}

		if (p.algorithm === "sliding-window") {
			const history: number[] = (entry.history || []).filter(
				(ts: number) => ts > p.now - p.windowMs,
			);
			history.push(p.now);
			entry.history = history;
			const allowed = history.length <= p.limit;
			const remaining = Math.max(0, p.limit - history.length);
			const oldest = history[0] || p.now;
			const resetMs = oldest + p.windowMs - p.now;
			this.cache.set(p.key, entry);
			return { allowed, remaining, resetMs };
		}

		// Token Bucket
		const elapsed = p.now - entry.lastRefill;
		const refilled = Math.floor(elapsed / p.refillIntervalMs) * p.refillRate;
		if (refilled > 0) {
			entry.tokens = Math.min(p.capacity, entry.tokens + refilled);
			entry.lastRefill = p.now;
		}
		const allowed = entry.tokens >= 1;
		if (allowed) entry.tokens -= 1;
		const remaining = entry.tokens;
		const resetMs = p.refillIntervalMs;
		this.cache.set(p.key, entry);
		return { allowed, remaining, resetMs };
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, val] of this.cache.entries()) {
			if (val.resetAt && now > val.resetAt + 10000) {
				this.cache.delete(key);
			}
		}
	}

	async close(): Promise<void> {
		clearInterval(this.gcInterval);
	}
}
