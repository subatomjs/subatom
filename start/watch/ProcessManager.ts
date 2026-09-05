/**
 * @fileoverview ProcessManager is responsible for managing the lifecycle of one long-running
 * child process—starting it, stopping it, restarting it when files change, tracking its state,
 *  and preventing overlapping restarts.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { type ChildProcess, spawn } from "node:child_process";
import type {
	ProcessManagerOptions,
	ProcessStateStatus,
} from "../types/index.types.js";
import { logger } from "../utils/logger.js";

export class ProcessManager {
	private child: ChildProcess | null = null;
	private readonly opts: ProcessManagerOptions;
	private restarting = false;
	private disposed = false;
	private restartQueuedReason: string | null = null;

	constructor(opts: ProcessManagerOptions) {
		this.opts = opts;
	}

	public getStatus(): ProcessStateStatus {
		return {
			isRunning:
				this.child !== null &&
				!this.child.killed &&
				this.child.exitCode === null,
			isRestarting: this.restarting,
			isDisposed: this.disposed,
			pid: this.child?.pid,
		};
	}

	public start(): void {
		if (this.disposed) {
			return;
		}

		if (this.child && !this.child.killed && this.child.exitCode === null) {
			return;
		}

		const child = spawn(this.opts.command, [...this.opts.args], {
			cwd: this.opts.cwd,
			env: { ...process.env, ...this.opts.env },
			stdio: "inherit",
		});

		this.child = child;

		const onExit = (code: number | null) => {
			if (this.child === child) {
				this.child = null;
			}
			if (!this.restarting && !this.disposed && code !== 0 && code !== null) {
				logger.error(`${this.opts.label} crashed (exit code ${code})`);
			}
		};

		const onError = (err: Error) => {
			if (this.child === child) {
				this.child = null;
			}
			if (!this.disposed) {
				logger.error(`Failed to start ${this.opts.label}: ${err.message}`);
			}
		};

		child.once("exit", onExit);
		child.once("error", onError);
	}

	public async restart(reason?: string): Promise<void> {
		if (this.disposed) {
			return;
		}

		if (this.restarting) {
			this.restartQueuedReason = reason ?? "queued change";
			return;
		}

		this.restarting = true;

		if (reason) {
			logger.info(`File changed: ${reason}`);
		}

		if (this.child) {
			const currentChild = this.child;
			this.child = null;
			currentChild.removeAllListeners();
			await this.killChildProcess(currentChild);
		}

		this.restarting = false;
		this.start();

		if (this.restartQueuedReason) {
			const nextReason = this.restartQueuedReason;
			this.restartQueuedReason = null;
			await this.restart(nextReason);
		}
	}

	public async stop(): Promise<void> {
		this.disposed = true;
		this.restartQueuedReason = null;

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
				resolve();
				return;
			}

			const pid = child.pid;

			if (process.platform === "win32") {
				const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
					stdio: "ignore",
				});
				killer.once("close", () => resolve());
				killer.once("error", () => resolve());
				return;
			}

			const killer = spawn("pkill", ["-9", "-P", String(pid)], {
				stdio: "ignore",
			});
			let finished = false;
			const finish = () => {
				if (finished) return;
				finished = true;
				try {
					process.kill(pid, "SIGKILL");
				} catch {
					// Ignore failure if process already exited.
				}
				resolve();
			};
			killer.once("close", finish);
			killer.once("error", finish);
		});
	}
}
