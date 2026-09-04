/**
 * @fileoverview Default configuration options optimized for sub-millisecond latency.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ResolvedSocketOptions } from "../types/socket.types.js";

export const DEFAULT_OPTIONS: Readonly<ResolvedSocketOptions> = {
	heartbeatIntervalMs: 30_000,
	maxConnections: Infinity,
	maxMessagesPerSecond: 1000,
	maxPayloadBytes: 1024 * 1024, // 1MB
	shutdownTimeoutMs: 5_000,
	// Disabled by default to eliminate zlib compression queues and frame delay
	perMessageDeflate: false,
	backpressureLimitBytes: 1024 * 1024,
};
