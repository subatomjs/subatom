import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import { logger } from "../utils/logger.js";

interface WatcherOptions {
  /** Folder to watch, e.g. "src" */
  watchDir: string;
  /** File extensions to watch, e.g. [".ts", ".js"] */
  extensions: string[];
  /** Wait time (ms) after a change before restarting — avoids double-restarts */
  debounceMs: number;
  /** Called when a real change is detected (after debounce) */
  onChange: (changedFile: string) => void;
}

export function createWatcher(opts: WatcherOptions): FSWatcher {
  const absDir = path.resolve(process.cwd(), opts.watchDir);

  const watcher = chokidar.watch(absDir, {
    ignored: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
    ],
    ignoreInitial: true, // don't fire on startup, only on real edits
    persistent: true,
  });

  let debounceTimer: NodeJS.Timeout | null = null;

  const handleEvent = (filePath: string) => {
    const ext = path.extname(filePath);
    if (!opts.extensions.includes(ext)) return; // ignore file types we don't care about

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      opts.onChange(filePath);
    }, opts.debounceMs);
  };

  watcher.on("change", handleEvent);
  watcher.on("add", handleEvent);
  watcher.on("unlink", handleEvent);

  watcher.on("error", (err) => {
    logger.error(`Watcher error: ${err instanceof Error ? err.message : err}`);
  });

  return watcher;
}