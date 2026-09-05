/**
 * @fileoverview Subatom framework configuration type provider.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export interface SubatomConfig {
	entry: string;
	outDir: string;
	port: number;
	host: string;
	sourcemap: boolean;
	minify: boolean;
	watch: {
		extensions: string[];
		debounceMs: number;
		ignore: string[];
	};
}

export type ISubatomConfig = Partial<SubatomConfig>;
