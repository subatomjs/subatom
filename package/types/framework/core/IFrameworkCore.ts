import type { MiddlewareHandler } from "../../http/IMiddleware.js";
import type { IRequest } from "../../http/IRequest.js";
import type { IResponse } from "../../http/IResponse.js";

export interface IRequestContext {
	req: IRequest;
	res: IResponse;
}

export interface ISubatomServerConfig {
	port?: number | string;
	host?: string;
	appName?: string;
	shutdownTimeoutMs?: number;
	[key: string]: unknown;
}

export interface IGroupContext {
	prefix: string;
	middlewares: MiddlewareHandler[];
	tags: string[];
	rateLimitSpec: string | undefined;
	rateLimitMiddleware: MiddlewareHandler | undefined;
}
