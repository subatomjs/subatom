/**
 * @fileoverview Deep-merges configuration objects, preserving nested values,
 * replacing arrays, and ignoring undefined values to produce the final config.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export function deepMerge<T extends object>(
	...objects: (Partial<T> | undefined | null)[]
): T {
	const result: Record<string, unknown> = {};

	for (const obj of objects) {
		if (!obj) continue;

		for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
			if (value === undefined) {
				continue; // Do not overwrite with explicit undefined
			}
			if (
				value !== null &&
				typeof value === "object" &&
				!Array.isArray(value) &&
				!(value instanceof Date) &&
				!(value instanceof RegExp)
			) {
				// Nested plain object deep merge
				const existing = result[key];
				const nestedTarget =
					existing !== null &&
					typeof existing === "object" &&
					!Array.isArray(existing)
						? (existing as Record<string, unknown>)
						: {};
				result[key] = deepMerge(nestedTarget, value as Record<string, unknown>);
			} else if (Array.isArray(value)) {
				// Arrays replace entirely per standard config behavior to avoid unexpected append states
				result[key] = [...value];
			} else {
				// Primitives
				result[key] = value;
			}
		}
	}

	return result as T;
}
