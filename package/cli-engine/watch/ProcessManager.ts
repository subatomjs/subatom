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
		this.child = spawn(this.opts.command, this.opts.args, {
			cwd: this.opts.cwd,
			env: { ...process.env, ...this.opts.env },
			stdio: "inherit",
		});

		this.child.on("exit", (code) => {
			const wasRestarting = this.isRestarting;
			this.child = null;

			if (!wasRestarting && code !== 0 && code !== null) {
				logger.error(`${this.opts.label} crashed (exit code ${code})`);
			}
		});

		this.child.on("error", (err) => {
			logger.error(`Failed to start ${this.opts.label}: ${err.message}`);
		});
	}

	public async restart(reason?: string): Promise<void> {
		if (this.isRestarting) return;
		this.isRestarting = true;

		if (reason) {
			logger.info(`File changed: ${reason}`);
		}

		if (this.child) {
			await this.killChildProcess(this.child);
		}

		this.isRestarting = false;
		this.start();
	}

	public async stop(): Promise<void> {
		if (this.child) {
			await this.killChildProcess(this.child);
			this.child = null;
		}
	}

	private killChildProcess(child: ChildProcess): Promise<void> {
		return new Promise((resolve) => {
			if (child.killed || child.exitCode !== null || child.pid === undefined) {
				return resolve();
			}

			const pid = child.pid;

			const cleanup = () => {
				// Wait 100ms for OS kernel to mark socket closed
				setTimeout(resolve, 100);
			};

			child.once("exit", cleanup);

			if (process.platform === "win32") {
				try {
					execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
				} catch {}
			} else {
				try {
					// Kill all child processes spawned under this PID on macOS/Linux
					execSync(`pkill -9 -P ${pid}`, { stdio: "ignore" });
				} catch {}

				try {
					// Kill the main process PID directly
					process.kill(pid, "SIGKILL");
				} catch {}
			}

			// Safety fallback in case 'exit' event was already consumed
			setTimeout(cleanup, 300);
		});
	}
}
