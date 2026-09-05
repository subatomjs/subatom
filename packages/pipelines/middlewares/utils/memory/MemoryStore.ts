/**
 * @fileoverview This module is responsible for in-memory HTTP session storage (MemoryStore),
 * implementing the ISessionStore interface to manage session data in the application's process memory.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ISessionData, ISessionStore } from "../../types/session.types.js";

interface Entry {
	data: ISessionData;
	expiresAt: number | null;
}

export class MemoryStore implements ISessionStore {
	private readonly entries = new Map<string, Entry>();
	private readonly cleanupTimer: NodeJS.Timeout;
	private closed = false;

	constructor(cleanupMs = 60_000) {
		this.cleanupTimer = setInterval(() => this.cleanup(), cleanupMs);
		this.cleanupTimer.unref();
	}

	async get(sid: string): Promise<ISessionData | null> {
		if (this.closed) return null;
		const entry = this.entries.get(sid);
		if (!entry) return null;

		if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
			this.entries.delete(sid);
			return null;
		}

		return cloneData(entry.data);
	}

	async set(sid: string, data: ISessionData, maxAgeMs?: number): Promise<void> {
		if (this.closed) throw new Error("MemoryStore is closed.");
		this.entries.set(sid, {
			data: cloneData(data),
			expiresAt: typeof maxAgeMs === "number" ? Date.now() + maxAgeMs : null,
		});
	}

	async destroy(sid: string): Promise<void> {
		if (this.closed) return;
		this.entries.delete(sid);
	}

	async touch(sid: string, maxAgeMs?: number): Promise<void> {
		if (this.closed) return;
		const entry = this.entries.get(sid);
		if (!entry) return;
		entry.expiresAt =
			typeof maxAgeMs === "number" ? Date.now() + maxAgeMs : null;
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		clearInterval(this.cleanupTimer);
		this.entries.clear();
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [sid, entry] of this.entries) {
			if (entry.expiresAt !== null && entry.expiresAt <= now) {
				this.entries.delete(sid);
			}
		}
	}
}

function cloneData(data: ISessionData): ISessionData {
	return structuredClone(data);
}
