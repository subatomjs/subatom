export function getHeader(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): string | undefined {
	if (!name) return undefined;
	const key = name.toLowerCase();
	const val = headers[key];
	return Array.isArray(val) ? val.join(", ") : val;
}
