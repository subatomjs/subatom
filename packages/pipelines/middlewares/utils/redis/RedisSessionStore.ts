import type { ISessionData, ISessionStore } from "../../types/session.types.js";

export interface RedisSessionClient {
	eval(
		script: string,
		numKeys: number,
		...args: (string | number)[]
	): Promise<unknown>;
}

export interface RedisSessionStoreOptions {
	prefix?: string;
	timeoutMs?: number;
	retries?: number;
	retryDelayMs?: number;
}

export class RedisSessionStore implements ISessionStore {
	private readonly prefix: string;
	private readonly timeoutMs: number;
	private readonly retries: number;
	private readonly retryDelayMs: number;
	private closed = false;

	constructor(
		private readonly client: RedisSessionClient,
		options: RedisSessionStoreOptions = {},
	) {
		this.prefix = options.prefix ?? "subatom:session:";
		this.timeoutMs = positiveInteger(options.timeoutMs, 500);
		this.retries = nonNegativeInteger(options.retries, 1);
		this.retryDelayMs = nonNegativeInteger(options.retryDelayMs, 25);
	}

	async get(sid: string): Promise<ISessionData | null> {
		const raw = await this.call<string | null>(
			'local value = redis.call("GET", KEYS[1]); return value',
			this.key(sid),
		);
		if (!raw) return null;
		try {
			const parsed: unknown = JSON.parse(raw);
			return isSessionData(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	async set(sid: string, data: ISessionData, maxAgeMs?: number): Promise<void> {
		const payload = JSON.stringify(data);
		await this.call(
			'redis.call("SET", KEYS[1], ARGV[1]); local ttl = tonumber(ARGV[2]); if ttl and ttl > 0 then redis.call("PEXPIRE", KEYS[1], ttl) end; return 1',
			this.key(sid),
			payload,
			maxAgeMs ?? 0,
		);
	}

	async destroy(sid: string): Promise<void> {
		await this.call('return redis.call("DEL", KEYS[1])', this.key(sid));
	}

	async touch(sid: string, maxAgeMs?: number): Promise<void> {
		if (!maxAgeMs || maxAgeMs <= 0) return;
		await this.call(
			'return redis.call("PEXPIRE", KEYS[1], ARGV[1])',
			this.key(sid),
			maxAgeMs,
		);
	}

	async close(): Promise<void> {
		this.closed = true;
	}

	private key(sid: string): string {
		return `${this.prefix}${sid}`;
	}

	private async call<T>(
		script: string,
		key: string,
		...args: (string | number)[]
	): Promise<T> {
		if (this.closed) throw new Error("RedisSessionStore is closed.");
		let lastError: Error | undefined;
		for (let attempt = 0; attempt <= this.retries; attempt += 1) {
			try {
				return await this.callOnce<T>(script, key, ...args);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt < this.retries && this.retryDelayMs > 0) {
					await delay(this.retryDelayMs);
				}
			}
		}
		throw lastError ?? new Error("Redis session operation failed.");
	}

	private async callOnce<T>(
		script: string,
		key: string,
		...args: (string | number)[]
	): Promise<T> {
		let timer: NodeJS.Timeout | undefined;
		try {
			return await Promise.race([
				this.client.eval(script, 1, key, ...args) as Promise<T>,
				new Promise<T>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error("Redis session operation timed out.")),
						this.timeoutMs,
					);
				}),
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
}

function isSessionData(value: unknown): value is ISessionData {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? value
		: fallback;
}

function nonNegativeInteger(
	value: number | undefined,
	fallback: number,
): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: fallback;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref();
	});
}
