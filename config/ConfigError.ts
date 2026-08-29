/**
 * @fileoverview Configuration error body.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export class ConfigError extends Error {
	constructor(key: string, expected: string, received: unknown) {
		const safeReceived =
			typeof received === "string" && received.length > 50
				? "[REDACTED OR TRUNCATED]"
				: String(received);
		super(
			`[Subatom Config Error]: Invalid value for "${key}". Expected ${expected}, received: ${safeReceived}`,
		);
		this.name = "ConfigError";
	}
}
