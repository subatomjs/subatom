/**
 * @fileoverview Types provider of subatom server.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type { MiddlewareHandler } from "../../../pipelines/pipeline.types.js";

export interface IRequestContext {
	req: IRequest;
	res: IResponse;
}

export interface ISubatomServerConfig {
	port?: number | string;
	host?: string;
	appName?: string;
	shutdownTimeoutMs?: number;
	headersTimeout?: number;
	requestTimeout?: number;
	keepAliveTimeout?: number;
	maxConnections?: number;
	maxConcurrentRequests?: number;
	[key: string]: unknown;
}

export interface ISubatomServerMetrics {
	activeRequests: number;
	totalRequests: number;
	failedRequests: number;
	accepted: boolean;
}

export interface IGroupContext {
	prefix: string;
	middlewares: MiddlewareHandler[];
	tags: string[];
	rateLimitSpec: string | undefined;
	rateLimitMiddleware: MiddlewareHandler | undefined;
}
