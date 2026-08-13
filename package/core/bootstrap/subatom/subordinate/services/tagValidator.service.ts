// subatom/package/core/bootstrap/subatom/subordinate/services/tagValidator.service.ts

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
