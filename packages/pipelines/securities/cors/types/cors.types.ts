/**
 * @fileoverview Type provider for total cors middleware.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../../../pipelines/next/types/nextFunction.types.js";

export type StaticOrigin = string | boolean | RegExp | (string | RegExp)[];

export type CustomOriginCallback = (err: Error | null, allow?: boolean) => void;

export type CustomOriginFunction = (
	requestOrigin: string | undefined,
	callback: CustomOriginCallback,
) => void;

export type AsyncOriginFunction = (
	requestOrigin: string | undefined,
) => Promise<boolean>;

export type CorsOrigin =
	| StaticOrigin
	| CustomOriginFunction
	| AsyncOriginFunction;

export interface ICorsOptions {
	origin?: CorsOrigin;
	methods?: string | string[];
	allowedHeaders?: string | string[];
	exposedHeaders?: string | string[];
	credentials?: boolean;
	maxAge?: number;
	preflightContinue?: boolean;
	optionsSuccessStatus?: number;
}

export type CorsMiddleware = (
	req: IRequest,
	res: IResponse,
	next: NextFunction,
) => Promise<void>;

export type FallbackRequest = {
	headers?: Record<string, string | string[] | undefined>;
	method?: string;
};
