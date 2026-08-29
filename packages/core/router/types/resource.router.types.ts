/**
 * @fileoverview Types provider of resource router.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	IController,
	IRouteMiddleware,
} from "../../../context/types/context.types.js";
import type { IHandler, IRouteMetaOptions } from "./router.types.js";

export type ResourceAction =
	| "index"
	| "show"
	| "create"
	| "update"
	| "patch"
	| "delete"
	| "destroy";

export type ResourceActionHandler =
	| IController<unknown, Record<string, unknown>, unknown, unknown>
	| IHandler
	| IRouteMiddleware<unknown, Record<string, unknown>, unknown>
	| Array<
			IHandler | IRouteMiddleware<unknown, Record<string, unknown>, unknown>
	  >;

export type ResourceHandlers = ResourceActionHandler;

export interface IResourceController {
	index?: ResourceActionHandler;
	show?: ResourceActionHandler;
	create?: ResourceActionHandler;
	update?: ResourceActionHandler;
	patch?: ResourceActionHandler;
	delete?: ResourceActionHandler;
	destroy?: ResourceActionHandler;
	[key: string]: ResourceActionHandler | undefined;
}

export interface IResourceOptions {
	controller?: IResourceController;
	only?: ResourceAction[];
	except?: ResourceAction[];
	param?: string;
	middleware?: Array<
		IHandler | IRouteMiddleware<unknown, Record<string, unknown>, unknown>
	>;
	names?: Partial<Record<ResourceAction, string>>;
	namePrefix?: string;
	singular?: boolean;
	allowPatch?: boolean;
	tags?: string[];
	rateLimit?: IRouteMetaOptions["rateLimit"];
}

export interface IResourceRouteDefinition {
	method: string;
	path: string;
	handlers: IHandler[];
	meta?: IRouteMetaOptions;
}
