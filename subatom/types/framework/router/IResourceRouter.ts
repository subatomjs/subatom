import type { IHandler, IRouteMeta } from "./IRouter.js";

/**
 * The set of CRUD actions a resource controller may implement.
 */
export type ResourceAction = "index" | "show" | "create" | "update" | "destroy";

/**
 * A resource controller maps CRUD actions to one or more handlers.
 * Supplying an array lets an action carry its own middleware
 * (e.g. `show: [requireAuth, getUser]`) independent of the shared
 * `options.middleware` chain applied to every action.
 */
export type ResourceHandlers = IHandler | IHandler[];

export interface IResourceController {
  index?: ResourceHandlers;
  show?: ResourceHandlers;
  create?: ResourceHandlers;
  update?: ResourceHandlers;
  destroy?: ResourceHandlers;
}

export interface IResourceOptions {
  /** Register only these actions. Mutually exclusive with `except`. */
  only?: ResourceAction[];
  /** Register every implemented action except these. Mutually exclusive with `only`. */
  except?: ResourceAction[];
  /** Route param name for the member id. Defaults to "id". */
  param?: string;
  /** Handlers run before every generated route's own handlers (auth, validation, etc). */
  middleware?: IHandler[];
  /** Override the generated route name for individual actions. */
  names?: Partial<Record<ResourceAction, string>>;
  /** Prefix used when generating route names, e.g. "users" -> "users.show". Defaults to a slug of basePath. */
  namePrefix?: string;
  /**
   * Singular resource (e.g. `/profile`): the default action set drops
   * `index`, and every path omits the `:param` segment, since there's
   * exactly one instance of the resource per owner.
   */
  singular?: boolean;
  /** Also register PATCH for `update`, aliasing the same handlers as PUT. Defaults to true. */
  allowPatch?: boolean;
  tags?: string[];
  rateLimit?: IRouteMeta["rateLimit"];
}

export interface IResourceRouteDefinition {
  method: string;
  path: string;
  handlers: IHandler[];
  meta?: IRouteMeta;
}