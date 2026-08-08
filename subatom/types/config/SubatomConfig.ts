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

export type SubatomUserConfig = Partial<SubatomConfig>;
