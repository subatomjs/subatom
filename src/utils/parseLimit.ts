// utils/parseLimit.ts
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

	const value = parseFloat(match[1]!);
	const unit = match[2] || "b";

	return value * (units[unit] || 1);
}
