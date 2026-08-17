import path from "node:path";
import watcher, { type AsyncSubscription, type Event as ParcelEvent } from "@parcel/watcher";
import type {
    WatcherOptions,
} from "../../types/engine-utils/WatchConfig.js";
import { EventFilter } from "./EventFilter.js";

const DEFAULT_IGNORED_PATTERNS: readonly string[] = [
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

const DEFAULT_EXTENSIONS: readonly string[] = [
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
    private readonly watchPaths: readonly string[];
    private readonly filter: EventFilter;
    private readonly debounceMs: number;
    private readonly onChange: (filePath: string) => void | Promise<void>;
    private readonly ignoredPatterns: readonly string[];
    private readonly onError: ((error: Error) => void) | undefined;
    private isClosed = false;

    constructor(options: WatcherOptions & { ignored?: readonly string[] | undefined }) {
        this.watchPaths =
            options.watchPaths && options.watchPaths.length > 0
                ? options.watchPaths
                : [process.cwd()];

        const rawExts = options.extensions ?? DEFAULT_EXTENSIONS;
        this.ignoredPatterns = options.ignored ?? DEFAULT_IGNORED_PATTERNS;
        this.filter = new EventFilter(rawExts, this.ignoredPatterns);
        this.debounceMs = options.debounceMs ?? 150;
        this.onChange = options.onChange;
        this.onError = options.onError;
    }

    public async start(): Promise<void> {
        await this.close();
        this.isClosed = false;

        const uniquePaths = Array.from(
            new Set(this.watchPaths.map((p) => path.resolve(p))),
        );

        const subscriptionPromises = uniquePaths.map((watchDir) =>
            watcher.subscribe(
                watchDir,
                (err: Error | null, events: ParcelEvent[]) => {
                    if (err) {
                        if (this.onError) {
                            this.onError(err);
                        }
                        return;
                    }
                    if (this.isClosed || !events || events.length === 0) {
                        return;
                    }

                    const relevantEvent = events.find((event) =>
                        this.filter.shouldProcess(event.path),
                    );

                    if (relevantEvent) {
                        if (this.debounceTimer) {
                            clearTimeout(this.debounceTimer);
                        }

                        this.debounceTimer = setTimeout(() => {
                            if (!this.isClosed) {
                                void this.onChange(relevantEvent.path);
                            }
                        }, this.debounceMs);
                    }
                },
                {
                    ignore: [...this.ignoredPatterns],
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
            const activeSubscriptions = [...this.subscriptions];
            this.subscriptions = [];
            await Promise.all(activeSubscriptions.map((sub) => sub.unsubscribe()));
        }
    }
}