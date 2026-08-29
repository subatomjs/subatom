/**
 * @fileoverview Combines a group's existing prefix with a new path segment,
 * validating the segment before composing the final path.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { combinePaths } from "../../helpers/combinePath.js";

export function appendPrefix(currentPrefix: string, segment: string): string {
	if (typeof segment !== "string") {
		throw new TypeError("[Subatom] .prefix() expects a string argument.");
	}
	return combinePaths(currentPrefix, segment);
}
