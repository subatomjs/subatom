import type { IRouteMeta } from "../../../types/framework/router/IRouter.js";
import type {
  IResourceController,
  IResourceOptions,
  IResourceRouteDefinition,
  ResourceAction,
} from "../../../types/framework/router/IResourceRouter.js";
import { normalizeHandlers } from "./normalizeHandlers.js";

const PLURAL_ACTION_ORDER: ResourceAction[] = [
  "index",
  "create",
  "show",
  "update",
  "destroy",
];
const SINGULAR_ACTION_ORDER: ResourceAction[] = [
  "create",
  "show",
  "update",
  "destroy",
];

const ACTION_METHOD: Record<ResourceAction, string> = {
  index: "GET",
  create: "POST",
  show: "GET",
  update: "PUT",
  destroy: "DELETE",
};

const MEMBER_ACTIONS = new Set<ResourceAction>(["show", "update", "destroy"]);

function slugifyForName(basePath: string): string {
  const cleaned = basePath.replace(/^\/+|\/+$/g, "");
  return cleaned.replace(/:/g, "").replace(/\//g, ".") || "root";
}

function joinPath(basePath: string, suffix: string): string {
  const cleanBase = ("/" + basePath).replace(/\/+/g, "/").replace(/\/$/, "");
  const combined = suffix ? `${cleanBase}/${suffix}` : cleanBase || "/";
  return combined.replace(/\/+/g, "/") || "/";
}

function resolveActions(
  basePath: string,
  defaultOrder: ResourceAction[],
  controller: IResourceController,
  options: IResourceOptions,
): ResourceAction[] {
  if (options.only) {
    const unknown = options.only.filter((a) => !defaultOrder.includes(a));
    if (unknown.length > 0) {
      throw new TypeError(
        `[Subatom] router.resource("${basePath}"): 'only' contains action(s) not valid for a ` +
          `${options.singular ? "singular" : "plural"} resource: ${unknown.join(", ")}.`,
      );
    }

    const missing = options.only.filter((a) => !controller[a]);
    if (missing.length > 0) {
      throw new TypeError(
        `[Subatom] router.resource("${basePath}"): 'only' requested action(s) not implemented ` +
          `on the controller: ${missing.join(", ")}.`,
      );
    }

    return defaultOrder.filter((a) => options.only!.includes(a));
  }

  return defaultOrder.filter((a) => !options.except?.includes(a));
}

/**
 * Turns a resource controller into a flat list of route definitions.
 * Pure function — no registration side effects — so it can be unit
 * tested independently of Router/dispatch.
 */
export function buildResourceRoutes(
  basePath: string,
  controller: IResourceController,
  options: IResourceOptions = {},
): IResourceRouteDefinition[] {
  if (!basePath || typeof basePath !== "string") {
    throw new TypeError(
      "[Subatom] router.resource: 'basePath' must be a non-empty string.",
    );
  }

  if (!controller || typeof controller !== "object") {
    throw new TypeError(
      `[Subatom] router.resource("${basePath}"): a controller object is required.`,
    );
  }

  if (options.only && options.except) {
    throw new TypeError(
      `[Subatom] router.resource("${basePath}"): 'only' and 'except' are mutually exclusive.`,
    );
  }

  const param = options.param?.trim() || "id";
  if (param.includes("/") || param.includes(":")) {
    throw new TypeError(
      `[Subatom] router.resource("${basePath}"): invalid param name "${param}".`,
    );
  }

  const singular = options.singular === true;
  const allowPatch = options.allowPatch !== false;
  const namePrefix = options.namePrefix?.trim() || slugifyForName(basePath);
  const defaultOrder = singular ? SINGULAR_ACTION_ORDER : PLURAL_ACTION_ORDER;

  const actions = resolveActions(basePath, defaultOrder, controller, options);

  const sharedMiddleware = options.middleware ?? [];
  for (const mw of sharedMiddleware) {
    if (typeof mw !== "function") {
      throw new TypeError(
        `[Subatom] router.resource("${basePath}"): 'middleware' must contain only functions.`,
      );
    }
  }

  const routes: IResourceRouteDefinition[] = [];

  for (const action of actions) {
    const implementation = controller[action];
    if (!implementation) continue; // partial controller: silently skip unimplemented actions

    const ownHandlers = normalizeHandlers(implementation, basePath, action);
    const handlers = [...sharedMiddleware, ...ownHandlers];

    const pathSuffix =
      !singular && MEMBER_ACTIONS.has(action) ? `:${param}` : "";
    const path = joinPath(basePath, pathSuffix);
    const name = options.names?.[action] ?? `${namePrefix}.${action}`;

    const meta: IRouteMeta = { name };
    if (options.tags) meta.tags = options.tags;
    if (options.rateLimit) meta.rateLimit = options.rateLimit;

    routes.push({ method: ACTION_METHOD[action], path, handlers, meta });

    // REST clients disagree on PUT vs PATCH for partial updates; register
    // both against the same handlers rather than forcing a choice. The
    // alias is intentionally unnamed so it can't collide with `meta.name`
    // uniqueness checks in Router.registerWithMeta.
    if (action === "update" && allowPatch) {
      const aliasMeta: IRouteMeta = {};
      if (options.tags) aliasMeta.tags = options.tags;
      if (options.rateLimit) aliasMeta.rateLimit = options.rateLimit;
      // aliasMeta may be an empty object but meta is required on
      // IResourceRouteDefinition, so always provide an object.
      routes.push({
        method: "PATCH",
        path,
        handlers,
        meta: aliasMeta as IRouteMeta,
      });
    }
  }

  return routes;
}
