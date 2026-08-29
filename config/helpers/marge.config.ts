/**
 * @fileoverview Responsible deep marge config.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

// biome-ignore lint: false positive
export function mergeConfig<T extends Record<string, any>>(
	...objects: Partial<T>[]
): T {
	// biome-ignore lint: false positive
	const result: any = {};

	for (const obj of objects) {
		if (!obj) continue;
		for (const [key, value] of Object.entries(obj)) {
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
				result[key] = mergeConfig(result[key] || {}, value);
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
