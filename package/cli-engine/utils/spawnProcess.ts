import { type ChildProcess, spawn } from "node:child_process";
import type { RunOptions } from "../../types/engine-utils/RunOptions.js";
import { logger } from "./logger.js";

// Global tracking for spawned child processes
const activeChildren = new Set<ChildProcess>();
let globalSignalHandlersAttached = false;

function setupGlobalSignalHandlers() {
    if (globalSignalHandlersAttached) return;
    globalSignalHandlersAttached = true;

    const shutdown = (signal: NodeJS.Signals) => {
        for (const child of activeChildren) {
            if (!child.killed) {
                child.kill(signal);
            }
        }
        process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
}

export function runProcess(
    command: string,
    args: string[],
    opts: RunOptions,
): ChildProcess {
    setupGlobalSignalHandlers();

    const child = spawn(command, args, {
        cwd: opts.cwd ?? process.cwd(),
        env: { ...process.env, ...opts.env },
        stdio: "inherit",
        shell: process.platform === "win32",
    });

    activeChildren.add(child);

    child.on("exit", (code, signal) => {
        activeChildren.delete(child);

        if (code !== 0 && code !== null) {
            logger.error(
                `${opts.label} exited with code ${code}${signal ? ` (${signal})` : ""}`,
            );
            process.exit(code);
        }
    });

    child.on("error", (err) => {
        activeChildren.delete(child);
        logger.error(`Failed to start ${opts.label}: ${err.message}`);
        process.exit(1);
    });

    return child;
}