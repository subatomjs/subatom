import type { IWebSocketOptions } from "../websocket/IWebSocket.js";

export interface SubatomConfig {
	entry: string;
	outDir: string;
	port: number;
	host: string;
	sourcemap: boolean;
	minify: boolean;
	websocket: boolean;
	websocketOptions?: IWebSocketOptions;
	watch: {
		extensions: string[];
		debounceMs: number;
		ignore: string[];
	};
}

export type SubatomUserConfig = Partial<SubatomConfig>;
