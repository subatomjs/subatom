// watch/ProcessManager.ts
import { type ChildProcess, execSync, spawn } from "node:child_process";
import type { ProcessManagerOptions } from "../../types/engine-utils/WatchConfig.js";
import { logger } from "../utils/logger.js";

export class ProcessManager {
    private child: ChildProcess | null = null;
    private opts: ProcessManagerOptions;
    private isRestarting = false;

    constructor(opts: ProcessManagerOptions) {
        this.opts = opts;
    }

    public start(): void {
        const child = spawn(this.opts.command, this.opts.args, {
            cwd: this.opts.cwd,
            env: { ...process.env, ...this.opts.env },
            stdio: "inherit",
        });

        this.child = child;

        const onExit = (code: number | null) => {
            if (this.child === child) {
                this.child = null;
            }
            if (!this.isRestarting && code !== 0 && code !== null) {
                logger.error(`${this.opts.label} crashed (exit code ${code})`);
            }
        };

        const onError = (err: Error) => {
            if (this.child === child) {
                this.child = null;
            }
            logger.error(`Failed to start ${this.opts.label}: ${err.message}`);
        };

        child.once("exit", onExit);
        child.once("error", onError);
    }

    public async restart(reason?: string): Promise<void> {
        if (this.isRestarting) return;
        this.isRestarting = true;

        if (reason) {
            logger.info(`File changed: ${reason}`);
        }

        if (this.child) {
            const currentChild = this.child;
            this.child = null;
            currentChild.removeAllListeners();
            await this.killChildProcess(currentChild);
        }

        this.isRestarting = false;
        this.start();
    }

    public async stop(): Promise<void> {
        if (this.child) {
            const currentChild = this.child;
            this.child = null;
            currentChild.removeAllListeners();
            await this.killChildProcess(currentChild);
        }
    }

    private killChildProcess(child: ChildProcess): Promise<void> {
        return new Promise((resolve) => {
            if (child.killed || child.exitCode !== null || child.pid === undefined) {
                return resolve();
            }

            const pid = child.pid;

            if (process.platform === "win32") {
                try {
                    execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
                } catch {}
                return setTimeout(resolve, 50);
            }

            try {
                // Terminate the child process tree cleanly
                execSync(`pkill -9 -P ${pid}`, { stdio: "ignore" });
            } catch {}

            try {
                process.kill(pid, "SIGKILL");
            } catch {}

            setTimeout(resolve, 50);
        });
    }
}