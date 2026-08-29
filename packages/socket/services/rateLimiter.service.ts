/**
 * @fileoverview Production-grade token bucket rate limiter.
 * Safeguards WebSocket connections against frame floods and resource exhaustion.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export class TokenBucket {
	private tokens: number;
	private lastRefill = Date.now();
	private readonly unlimited: boolean;

	constructor(
		private readonly capacity: number,
		private readonly refillPerSecond: number,
	) {
		this.unlimited =
			!Number.isFinite(capacity) ||
			capacity <= 0 ||
			!Number.isFinite(refillPerSecond) ||
			refillPerSecond <= 0;
		this.tokens = capacity;
	}

	public tryConsume(cost = 1): boolean {
		if (this.unlimited) return true;
		this.refill();
		if (this.tokens < cost) return false;
		this.tokens -= cost;
		return true;
	}

	private refill(): void {
		const now = Date.now();
		const elapsedSeconds = (now - this.lastRefill) / 1000;
		if (elapsedSeconds <= 0) return;
		this.tokens = Math.min(
			this.capacity,
			this.tokens + elapsedSeconds * this.refillPerSecond,
		);
		this.lastRefill = now;
	}
}
