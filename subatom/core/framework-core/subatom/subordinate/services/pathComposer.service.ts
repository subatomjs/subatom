import { combinePaths } from "../../helpers/combinePath.js";

export function appendPrefix(currentPrefix: string, segment: string): string {
	if (typeof segment !== "string") {
		throw new TypeError("[Subatom] .prefix() expects a string argument.");
	}
	return combinePaths(currentPrefix, segment);
}
