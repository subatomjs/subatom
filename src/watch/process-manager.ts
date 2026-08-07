import { type ChildProcess, spawn } from "node:child_process";
import { logger } from "../utils/logger.js";

interface ProcessManagerOptions {
	command: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	label: string;
}

export class ProcessManager {
	private child: ChildProcess | null = null;
	private opts: ProcessManagerOptions;
	private isRestarting = false;

	constructor(opts: ProcessManagerOptions) {
		this.opts = opts;
	}

	start(): void {
		this.child = spawn(this.opts.command, this.opts.args, {
			cwd: this.opts.cwd,
			env: { ...process.env, ...this.opts.env },
			stdio: "inherit",
			shell: process.platform === "win32",
		});

		this.child.on("exit", (code, signal) => {
			// If we killed it on purpose (for a restart), don't show error
			if (this.isRestarting) return;

			if (code !== 0 && code !== null) {
				logger.error(`${this.opts.label} crashed (exit code ${code})`);
				logger.info("Waiting for file changes to restart...");
			}
		});

		this.child.on("error", (err) => {
			logger.error(`Failed to start ${this.opts.label}: ${err.message}`);
		});
	}

	restart(reason?: string): void {
		if (reason) {
			logger.info(`File changed: ${reason}`);
		}
		logger.info("Restarting...");

		this.isRestarting = true;

		if (this.child) {
			this.child.once("exit", () => {
				this.isRestarting = false;
				this.start();
			});
			this.child.kill("SIGTERM");
		} else {
			this.isRestarting = false;
			this.start();
		}
	}

	stop(): void {
		if (this.child) {
			this.child.kill("SIGTERM");
			this.child = null;
		}
	}
}
