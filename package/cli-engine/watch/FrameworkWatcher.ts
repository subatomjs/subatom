// watch/FrameworkWatcher.ts
import path from "node:path";
import watcher, { type AsyncSubscription } from "@parcel/watcher";
import type { WatcherOptions } from "../../types/engine-utils/WatchConfig.js";

const DEFAULT_IGNORED_PATTERNS = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/.subatom/**",
    "**/.cache/**",
    "**/.turbo/**",
    "**/.sqlite*",
    "**/*.log",
    "**/*.tmp",
    "**/*.swp",
    "**/coverage/**",
    "**/.DS_Store",
];

const DEFAULT_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
];

export class FrameworkWatcher {
    private subscriptions: AsyncSubscription[] = [];
    private debounceTimer: NodeJS.Timeout | null = null;
    private readonly watchPaths: string[];
    private readonly extensions: Set<string>;
    private readonly debounceMs: number;
    private readonly onChange: (filePath: string) => void;
    private readonly ignoredPatterns: string[];
    private isClosed = false;

    constructor(options: WatcherOptions & { ignored?: string[] }) {
        this.watchPaths =
            options.watchPaths && options.watchPaths.length > 0
                ? options.watchPaths
                : [process.cwd()];

        const rawExts = options.extensions ?? DEFAULT_EXTENSIONS;
        this.extensions = new Set(
            rawExts.map((ext) =>
                ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
            ),
        );

        this.debounceMs = options.debounceMs ?? 150;
        this.onChange = options.onChange;
        this.ignoredPatterns = options.ignored ?? DEFAULT_IGNORED_PATTERNS;
    }

    public async start(): Promise<void> {
        await this.close(); // Clean up any existing subscriptions first
        this.isClosed = false; // Reset closed state after cleanup completes

        const uniquePaths = Array.from(
            new Set(this.watchPaths.map((p) => path.resolve(p))),
        );

        const subscriptionPromises = uniquePaths.map((watchDir) =>
            watcher.subscribe(
                watchDir,
                (err, events) => {
                    if (err || this.isClosed) return;

                    const relevantEvent = events.find((event) => {
                        const ext = path.extname(event.path).toLowerCase();
                        return this.extensions.has(ext);
                    });

                    if (relevantEvent) {
                        if (this.debounceTimer) {
                            clearTimeout(this.debounceTimer);
                        }

                        this.debounceTimer = setTimeout(() => {
                            if (!this.isClosed) {
                                this.onChange(relevantEvent.path);
                            }
                        }, this.debounceMs);
                    }
                },
                {
                    ignore: this.ignoredPatterns,
                },
            ),
        );

        this.subscriptions = await Promise.all(subscriptionPromises);
    }

    public async close(): Promise<void> {
        this.isClosed = true;

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        if (this.subscriptions.length > 0) {
            const subs = [...this.subscriptions];
            this.subscriptions = [];
            await Promise.all(subs.map((s) => s.unsubscribe()));
        }
    }
}