/**
 * @fileoverview Subatom framework configuration type provider.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ISocketOptions } from "../../packages/socket/types/socket.types.js";

export interface SubatomConfig {
	entry: string;
	outDir: string;
	port: number;
	host: string;
	sourcemap: boolean;
	minify: boolean;
	websocket: boolean;
	websocketOptions?: ISocketOptions;
	watch: {
		extensions: string[];
		debounceMs: number;
		ignore: string[];
	};
}

export type ISubatomConfig = Partial<SubatomConfig>;
