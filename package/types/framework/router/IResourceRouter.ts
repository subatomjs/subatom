// subatom/package/types/framework/router/IResourceRouter.ts

import type { IController, IRouteMiddleware } from "../../../types/context/IContext.js";
import type { IHandler, IRouteMetaOptions } from "./IRouter.js";

export type ResourceAction =
  | "index"
  | "show"
  | "create"
  | "update"
  | "patch"
  | "delete"
  | "destroy";

export type ResourceActionHandler =
  | IController<any, any, any, any>
  | IHandler
  | IRouteMiddleware
  | Array<IHandler | IRouteMiddleware>;

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
  middleware?: Array<IHandler | IRouteMiddleware>;
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