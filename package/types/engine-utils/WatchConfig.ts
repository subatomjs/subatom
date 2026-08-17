export type WatchEventType = "add" | "change" | "unlink";

export interface NormalizedWatchEvent {
    readonly type: WatchEventType;
    readonly path: string;
    readonly timestamp: number;
}

export type WatchChangeHandler = (filePath: string) => void | Promise<void>;

export interface WatcherOptions {
    readonly watchPaths?: readonly string[] | undefined;
    readonly extensions?: readonly string[] | undefined;
    readonly debounceMs?: number | undefined;
    readonly ignored?: readonly string[] | undefined;
    readonly onChange: WatchChangeHandler;
    readonly onError?: ((error: Error) => void) | undefined;
}

export interface ProcessManagerOptions {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly label: string;
    readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}