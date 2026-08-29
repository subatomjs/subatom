/**
 * @fileoverview This module is responsible for starting and managing child processes safely, especially when your main Node.js process is shutting down.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { type ChildProcess, spawn } from "node:child_process";
import { ProcessLifecycle } from "../life-cycle/ProcessLifecycle.js";
import type { ProcessSignal, RunOptions } from "../types/index.types.js";
import { logger } from "./logger.js";

const activeChildren = new Set<ChildProcess>();
let lifecycleAttached = false;

function ensureLifecycleHandlerAttached(): void {
	if (lifecycleAttached) {
		return;
	}
	lifecycleAttached = true;

	const lifecycle = ProcessLifecycle.getInstance();
	lifecycle.onShutdown((signalOrError: ProcessSignal | Error | undefined) => {
		const signalToSend: NodeJS.Signals =
			signalOrError === "SIGINT" || signalOrError === "SIGTERM"
				? signalOrError
				: "SIGTERM";

		for (const child of activeChildren) {
			if (!child.killed && child.exitCode === null) {
				try {
					child.kill(signalToSend);
				} catch {
					// Ignore already-terminated children
				}
			}
		}
		activeChildren.clear();
	});
}

export function runProcess(
	command: string,
	args: readonly string[],
	opts: RunOptions,
): ChildProcess {
	ensureLifecycleHandlerAttached();

	const child = spawn(command, [...args], {
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

	child.on("error", (err: Error) => {
		activeChildren.delete(child);
		logger.error(`Failed to start ${opts.label}: ${err.message}`);
		process.exit(1);
	});

	return child;
}
