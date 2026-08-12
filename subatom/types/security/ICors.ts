import { NextFunction } from "../framework/pipeline/INext.js";
import { IRequest } from "../http/IRequest.js";
import { IResponse } from "../http/IResponse.js";


export type StaticOrigin = string | boolean | RegExp | (string | RegExp)[];

export type CustomOriginCallback = (err: Error | null, allow?: boolean) => void;

export type CustomOriginFunction = (
	requestOrigin: string | undefined,
	callback: CustomOriginCallback,
) => void;

export type AsyncOriginFunction = (
	requestOrigin: string | undefined,
) => Promise<boolean>;

export type CorsOrigin = StaticOrigin | CustomOriginFunction | AsyncOriginFunction;

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