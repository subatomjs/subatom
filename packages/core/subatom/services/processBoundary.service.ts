/**
 * @fileoverview Handles global process errors, unhandled rejections,
 * shutdown signals, and emergency graceful server shutdown for Subatom.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { env } from "../../../../config/env/env.js";
import type { SubatomServer } from "../../server/SubatomServer.js";

interface ProcessBoundaryEntry {
	readonly getServerInstance: () => SubatomServer | undefined;
	readonly shutdownAction: (code: number) => void;
}

const registeredBoundaries = new Set<ProcessBoundaryEntry>();
let isProcessBoundaryRegistered = false;
let unhandledRejectionListener: ((reason: unknown) => void) | null = null;
let uncaughtExceptionListener: ((error: Error) => void) | null = null;
let sigintListener: (() => void) | null = null;
let sigtermListener: (() => void) | null = null;

function ensureGlobalProcessListeners(): void {
	if (isProcessBoundaryRegistered) {
		return;
	}
	isProcessBoundaryRegistered = true;

	unhandledRejectionListener = (reason: unknown) => {
		let recovered = false;

		for (const entry of registeredBoundaries) {
			const server = entry.getServerInstance();
			if (server?.tryRecoverFromOrphanedRejection(reason)) {
				recovered = true;
				break;
			}
		}

		if (recovered) {
			return;
		}

		console.error(
			"\n🔥 [Subatom Process Error] Unhandled Promise Rejection Detected:",
		);
		if (reason instanceof Error) {
			console.error(reason.stack ?? reason.message);
		} else {
			console.error(reason);
		}
	};
	process.on("unhandledRejection", unhandledRejectionListener);

	uncaughtExceptionListener = (error: Error) => {
		console.error("\n💥 [Subatom Fatal Error] Uncaught Synchronous Exception:");
		console.error(error.stack ?? error.message);

		if (env.isProd) {
			console.error("Initiating emergency graceful shutdown...");
			const entries = Array.from(registeredBoundaries);
			for (const entry of entries) {
				try {
					entry.shutdownAction(1);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					console.error(
						`[Subatom] Error during emergency shutdown: ${message}`,
					);
				}
			}
		}
	};
	process.on("uncaughtException", uncaughtExceptionListener);

	const handleSignal = (exitCode: number) => {
		const entries = Array.from(registeredBoundaries);
		registeredBoundaries.clear();

		for (const entry of entries) {
			try {
				entry.shutdownAction(exitCode);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(`[Subatom] Error during signal shutdown: ${message}`);
			}
		}
	};

	sigintListener = () => handleSignal(0);
	sigtermListener = () => handleSignal(0);
	process.once("SIGINT", sigintListener);
	process.once("SIGTERM", sigtermListener);
}

function removeGlobalProcessListeners(): void {
	if (!isProcessBoundaryRegistered) return;
	if (unhandledRejectionListener) {
		process.off("unhandledRejection", unhandledRejectionListener);
		unhandledRejectionListener = null;
	}
	if (uncaughtExceptionListener) {
		process.off("uncaughtException", uncaughtExceptionListener);
		uncaughtExceptionListener = null;
	}
	if (sigintListener) {
		process.off("SIGINT", sigintListener);
		sigintListener = null;
	}
	if (sigtermListener) {
		process.off("SIGTERM", sigtermListener);
		sigtermListener = null;
	}
	isProcessBoundaryRegistered = false;
}

export function registerProcessBoundary(
	getServerInstance: () => SubatomServer | undefined,
	shutdownAction: (code: number) => void,
): () => void {
	ensureGlobalProcessListeners();

	const entry: ProcessBoundaryEntry = {
		getServerInstance,
		shutdownAction,
	};

	registeredBoundaries.add(entry);

	return () => {
		registeredBoundaries.delete(entry);
		if (registeredBoundaries.size === 0) {
			removeGlobalProcessListeners();
		}
	};
}
