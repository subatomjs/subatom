export interface ProcessManagerOptions {
	command: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	label: string;
	killTimeoutMs?: number;
}
export interface WatcherOptions {
	watchPaths: string[];
	extensions?: string[];
	debounceMs?: number;
	onChange: (filePath: string) => void;
}
