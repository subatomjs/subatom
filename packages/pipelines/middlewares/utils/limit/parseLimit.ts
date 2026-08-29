/**
 * @fileoverview This module is responsible for parsing human-readable byte limit
 * strings into integer byte values used by size-limiting middleware.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export function parseLimit(limit: string | number): number {
	if (typeof limit === "number") return limit;

	const units: Record<string, number> = {
		b: 1,
		kb: 1024,
		mb: 1024 * 1024,
		gb: 1024 * 1024 * 1024,
	};

	const match = limit.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
	if (!match) return 1024 * 1024; // Default to 1MB if invalid

	const rawValue = match[1] ?? "";
	const value = parseFloat(rawValue);
	const unit = match[2] || "b";

	return value * (units[unit] || 1);
}
