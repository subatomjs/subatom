// watch/FrameworkWatcher.ts
import path from "node:path";
import watcher, { type AsyncSubscription } from "@parcel/watcher";
import type { WatcherOptions } from "../../types/engine-utils/WatchConfig.js";

export class FrameworkWatcher {
	private subscription: AsyncSubscription | null = null;
	private debounceTimer: NodeJS.Timeout | null = null;
	private readonly watchPaths: string[];
	private readonly extensions: Set<string>;
	private readonly debounceMs: number;
	private readonly onChange: (filePath: string) => void;

	constructor(options: WatcherOptions) {
		this.watchPaths = options.watchPaths;
		const exts = options.extensions ?? [
			"ts",
			"tsx",
			"js",
			"jsx",
			"json",
			"mjs",
			"cjs",
		];
		this.extensions = new Set(
			exts.map((e) => (e.startsWith(".") ? e : `.${e}`)),
		);
		this.debounceMs = options.debounceMs ?? 200;
		this.onChange = options.onChange;
	}

	public async start(): Promise<void> {
		// @parcel/watcher takes directory paths
		const watchDir = this.watchPaths[0] || process.cwd();

		this.subscription = await watcher.subscribe(
			watchDir,
			(err, events) => {
				if (err) return;

				// Check if any changed file matches allowed extensions
				const relevantEvent = events.find((event) => {
					const ext = path.extname(event.path);
					return this.extensions.has(ext);
				});

				if (relevantEvent) {
					if (this.debounceTimer) clearTimeout(this.debounceTimer);

					this.debounceTimer = setTimeout(() => {
						this.onChange(relevantEvent.path);
					}, this.debounceMs);
				}
			},
			{
				ignore: [
					"**/node_modules/**",
					"**/.git/**",
					"**/dist/**",
					"**/build/**",
					"**/.sqlite*",
					"**/*.log",
				],
			},
		);
	}

	public async close(): Promise<void> {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		if (this.subscription) {
			await this.subscription.unsubscribe();
			this.subscription = null;
		}
	}
}
