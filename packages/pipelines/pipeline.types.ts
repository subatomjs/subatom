/**
 * @fileoverview global types file of pipeline.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ISubatomError } from "../errors/types/subatom.error.types.js";
import type { IRequest } from "../core/http/request/types/request.types.js";
import type { IResponse } from "../core/http/response/types/response.types.js";
import type { NextFunction } from "./next/types/nextFunction.types.js";

export type TCorsOriginFunction = (
	origin: string | undefined,
	callback: (err: Error | null, allow?: boolean) => void,
) => void;

export interface IPipelineContext<TState = Record<string, unknown>> {
	readonly req: IRequest;
	readonly res: IResponse;
	readonly routePath?: string;
	readonly method?: string;
	readonly meta?: Record<string, unknown>;
	state: TState;
}

export type BeforeRequestFn<TState = Record<string, unknown>> = (
	ctx: IPipelineContext<TState>,
) => unknown | Promise<unknown>;

export type AfterRequestFn<
	TData = unknown,
	TState = Record<string, unknown>,
> = (data: TData, ctx: IPipelineContext<TState>) => unknown | Promise<unknown>;

export type BeforeResponseFn<TState = Record<string, unknown>> = (
	ctx: IPipelineContext<TState>,
) => unknown | Promise<unknown>;

export type AfterResponseFn<TState = Record<string, unknown>> = (
	ctx: IPipelineContext<TState>,
) => unknown | Promise<unknown>;

export interface ITransformer<
	TData = unknown,
	TState = Record<string, unknown>,
> {
	name?: string;
	priority?: number;
	beforeRequest?: BeforeRequestFn<TState>;
	afterRequest?: AfterRequestFn<TData, TState>;
	beforeResponse?: BeforeResponseFn<TState>;
	afterResponse?: AfterResponseFn<TState>;
}

export type InterceptorNext = () => Promise<unknown>;

export type InterceptorFn<TState = Record<string, unknown>> = (
	ctx: IPipelineContext<TState>,
	next: InterceptorNext,
) => unknown | Promise<unknown>;

export interface IInterceptor<TState = Record<string, unknown>> {
	name?: string;
	priority?: number;
	intercept: InterceptorFn<TState>;
}

export type SerializeFn<TData = unknown, TState = Record<string, unknown>> = (
	data: TData,
	ctx: IPipelineContext<TState>,
) => unknown | Promise<unknown>;

export interface ISerializer<
	TData = unknown,
	TState = Record<string, unknown>,
> {
	name?: string;
	priority?: number;
	contentType?: string;
	serialize: SerializeFn<TData, TState>;
}

export type PipelineScope = "global" | "group" | "route";

export function sortedByPriority<T extends { priority?: number }>(
	bucket: T[],
): T[] {
	return bucket
		.map((item, i) => ({ item, i }))
		.sort((a, b) => {
			const diff = (a.item.priority ?? 0) - (b.item.priority ?? 0);
			return diff !== 0 ? diff : a.i - b.i;
		})
		.map((x) => x.item);
}

/**
 * A global or path-scoped middleware.
 */
export type MiddlewareHandler = (
	req: IRequest,
	res: IResponse,
	next: NextFunction,
) => unknown | Promise<unknown>;

/**
 * An error-handling middleware.
 */
export type ErrorMiddlewareHandler = (
	err: ISubatomError,
	req: IRequest,
	res: IResponse,
	next: NextFunction,
) => unknown | Promise<unknown>;
