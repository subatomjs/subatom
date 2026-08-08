function normalizePathSegment(segment?: string | null): string {
	if (segment === null || segment === undefined) return "";
	const trimmed = String(segment).trim();
	if (trimmed.length === 0 || trimmed === "/") return "";

	const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
	return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

export function combinePaths(
	...segments: Array<string | undefined | null>
): string {
	const joined = segments
		.map((segment) => normalizePathSegment(segment))
		.filter((segment) => segment.length > 0)
		.join("");

	return joined.length === 0 ? "/" : joined;
}
