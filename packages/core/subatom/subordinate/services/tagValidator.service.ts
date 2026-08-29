/**
 * @fileoverview Collects and validates route tags, trimming whitespace and ignoring empty or invalid tag values.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export function collectTags(
	ownTags: string[],
	...tags: Array<string | string[]>
): void {
	for (const entry of tags) {
		if (Array.isArray(entry)) {
			for (const t of entry) {
				if (typeof t === "string" && t.trim().length > 0) {
					ownTags.push(t.trim());
				}
			}
		} else if (typeof entry === "string" && entry.trim().length > 0) {
			ownTags.push(entry.trim());
		}
	}
}
