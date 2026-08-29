/**
 * @fileoverview Default configuration options for socket.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ResolvedSocketOptions } from "../types/socket.types.js";

export const DEFAULT_OPTIONS: Readonly<ResolvedSocketOptions> = {
	heartbeatIntervalMs: 30_000,
	maxConnections: Infinity,
	maxMessagesPerSecond: 100,
	maxPayloadBytes: 1024 * 1024,
	shutdownTimeoutMs: 5_000,
	perMessageDeflate: true,
	backpressureLimitBytes: 1024 * 1024,
};
