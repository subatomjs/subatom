/**
 * @fileoverview Type provider of rate limiting middleware.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */


import type { IRequest } from "../../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../../core/http/response/types/response.types.js";

export type AlgorithmType = "fixed-window" | "sliding-window" | "token-bucket";

export type KeyType =
	| "ip"
	| "user"
	| "api-key"
	| "tenant"
	| "route"
	| "composite";

export type KeyResolver =
	| KeyType
	| ((req: IRequest) => string | Promise<string>);

export type StoreType = "memory" | "redis";
export type FailureMode = "fail-open" | "fail-closed";

export interface RedisClientLike {
	eval(
		script: string,
		numKeys: number,
		...args: (string | number)[]
	): Promise<unknown>;
}

export interface StoreEvalParams {
	key: string;
	algorithm: AlgorithmType;
	limit: number;
	windowMs: number;
	capacity: number;
	refillRate: number;
	refillIntervalMs: number;
	now: number;
}

export interface StoreEvalResult {
	allowed: boolean;
	remaining: number;
	resetMs: number;
}

export interface RateLimitStore {
	evaluate(params: StoreEvalParams): Promise<StoreEvalResult>;
	close?(): Promise<void>;
}

export interface PolicyConfig {
	name?: string;
	algorithm?: AlgorithmType;
	limit?: number;
	window?: string | number;
	capacity?: number;
	refillRate?: number;
	refillInterval?: string | number;
	key?: KeyResolver;
}

export interface HeaderConfig {
	standard?: boolean;
	legacy?: boolean;
	retryAfter?: boolean;
}

export interface RateLimitOptions extends PolicyConfig {
	policies?: PolicyConfig[];
	store?: StoreType | RateLimitStore;
	redisClient?: RedisClientLike;
	headers?: HeaderConfig;
	failureMode?: FailureMode;
	onLimitExceeded?: (
		req: IRequest,
		res: IResponse,
		meta: RateLimitResult,
	) => void;
	onStoreError?: (err: Error, req: IRequest) => void;
}

export interface RateLimitResult {
	allowed: boolean;
	limit: number;
	remaining: number;
	resetMs: number;
	policyName: string;
}

export interface NormalizedPolicy {
	name: string;
	algorithm: AlgorithmType;
	limit: number;
	windowMs: number;
	capacity: number;
	refillRate: number;
	refillIntervalMs: number;
	keyResolver: KeyResolver;
}

export interface NormalizedConfig {
	policies: NormalizedPolicy[];
	store: StoreType | RateLimitStore;
	redisClient?: RedisClientLike | undefined;
	headers: Required<HeaderConfig>;
	failureMode: FailureMode;
	onLimitExceeded?:
		| ((req: IRequest, res: IResponse, meta: RateLimitResult) => void)
		| undefined;
	onStoreError?: ((err: Error, req: IRequest) => void) | undefined;
}

export interface MemoryStoreEntry {
	count: number;
	resetAt: number;
	tokens: number;
	lastRefill: number;
	history?: number[];
}
