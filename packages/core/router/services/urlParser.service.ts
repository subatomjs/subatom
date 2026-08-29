/**
 * @fileoverview Provides URL parsing utilities to extract the pathname separately from query parameters.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export function extractPathname(rawUrl: string): string {
	const queryIndex = rawUrl.indexOf("?");
	const pathPart = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
	return pathPart || "/";
}

export function extractQuery(rawUrl: string): Record<string, string> {
	const queryIndex = rawUrl.indexOf("?");
	const queryString = queryIndex === -1 ? "" : rawUrl.slice(queryIndex + 1);
	const searchParams = new URLSearchParams(queryString);
	return Object.fromEntries(searchParams.entries());
}
