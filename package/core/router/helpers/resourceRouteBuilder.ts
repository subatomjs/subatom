import { getOrCreateContext } from "../../context/Context.js";
import type {
  IResourceController,
  IResourceOptions,
  IResourceRouteDefinition,
  ResourceAction,
  ResourceActionHandler,
} from "../../../types/framework/router/IResourceRouter.js";
import type { IHandler, IRouteMetaOptions } from "../../../types/framework/router/IRouter.js";
import type {
  IController,
  IContextMiddleware,
  ILegacyHandler,
  IRouteMiddleware,
} from "../../../types/context/IContext.js";
import type { IRequest } from "../../../types/http/IRequest.js";
import type { IResponse } from "../../../types/http/IResponse.js";
import type { NextFunction } from "../../../types/framework/pipeline/INext.js";

const PLURAL_ACTION_ORDER: ResourceAction[] = [
  "index",
  "create",
  "show",
  "update",
  "patch",
  "delete",
  "destroy",
];

const SINGULAR_ACTION_ORDER: ResourceAction[] = [
  "create",
  "show",
  "update",
  "patch",
  "delete",
  "destroy",
];

const ACTION_METHOD: Record<ResourceAction, string> = {
  index: "GET",
  create: "POST",
  show: "GET",
  update: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  destroy: "DELETE",
};

const MEMBER_ACTIONS = new Set<ResourceAction>([
  "show",
  "update",
  "patch",
  "delete",
  "destroy",
]);

function slugifyForName(basePath: string): string {
  const cleaned = basePath.replace(/^\/+|\/+$/g, "");
  return cleaned.replace(/:/g, "").replace(/\//g, ".") || "root";
}

function joinPath(basePath: string, suffix: string): string {
  const cleanBase = ("/" + basePath).replace(/\/+/g, "/").replace(/\/$/, "");
  const combined = suffix ? `${cleanBase}/${suffix}` : cleanBase || "/";
  return combined.replace(/\/+/g, "/") || "/";
}

function normalizeHandler(
  fn: IController | IHandler | IRouteMiddleware,
  isController: boolean,
): IHandler {
  if (isController) {
    return async (req: IRequest, res: IResponse, next: NextFunction) => {
      if (res.writableEnded) return;
      const ctx = getOrCreateContext(req, res);
      try {
        const result = await (fn as IController)(ctx);
        if (result !== undefined && !res.writableEnded) {
          if (
            typeof result === "object" &&
            result !== null &&
            !(result instanceof Buffer) &&
            !(result instanceof Uint8Array)
          ) {
            ctx.json(result);
          } else if (
            typeof result === "string" ||
            typeof result === "number" ||
            typeof result === "boolean"
          ) {
            ctx.send(String(result));
          }
        }
      } catch (err) {
        return next(err);
      }
    };
  }

  return async (req: IRequest, res: IResponse, next: NextFunction) => {
    if (fn.length >= 3) {
      return (fn as ILegacyHandler)(req, res, next);
    }
    const ctx = getOrCreateContext(req, res);
    return (fn as IContextMiddleware)(ctx, next);
  };
}

function normalizeActionHandlers(
  value: ResourceActionHandler,
  basePath: string,
  action: ResourceAction,
): IHandler[] {
  const rawList = Array.isArray(value) ? value : [value];

  if (rawList.length === 0) {
    throw new TypeError(
      `[Subatom] router.resource("${basePath}"): action "${action}" has an empty handler array.`,
    );
  }

  for (const item of rawList) {
    if (typeof item !== "function") {
      throw new TypeError(
        `[Subatom] router.resource("${basePath}"): action "${action}" must contain only functions.`,
      );
    }
  }

  return rawList.map((item, index) => {
    const isController = index === rawList.length - 1;
    return normalizeHandler(item, isController);
  });
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
        `[Subatom] router.resource("${basePath}"): 'only' contains action(s) not valid: ${unknown.join(", ")}.`,
      );
    }

    const missing = options.only.filter((a) => !controller[a]);
    if (missing.length > 0) {
      throw new TypeError(
        `[Subatom] router.resource("${basePath}"): 'only' requested action(s) not implemented: ${missing.join(", ")}.`,
      );
    }

    return defaultOrder.filter((a) => options.only!.includes(a));
  }

  return defaultOrder.filter((a) => !options.except?.includes(a));
}

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
  const sharedMiddleware = (options.middleware ?? []).map((mw) =>
    normalizeHandler(mw, false),
  );

  const routes: IResourceRouteDefinition[] = [];
  const registeredUpdates = new Set<string>();

  for (const action of actions) {
    const implementation = controller[action];
    if (!implementation) continue;

    const ownHandlers = normalizeActionHandlers(implementation, basePath, action);
    const handlers = [...sharedMiddleware, ...ownHandlers];

    const pathSuffix =
      !singular && MEMBER_ACTIONS.has(action) ? `:${param}` : "";
    const path = joinPath(basePath, pathSuffix);
    const name = options.names?.[action] ?? `${namePrefix}.${action}`;

    const meta: IRouteMetaOptions = { name };
    if (options.tags) meta.tags = options.tags;
    if (options.rateLimit) meta.rateLimit = options.rateLimit;

    routes.push({ method: ACTION_METHOD[action], path, handlers, meta });

    if (action === "update" && allowPatch && !controller.patch && !registeredUpdates.has(path)) {
      registeredUpdates.add(path);
      const aliasMeta: IRouteMetaOptions = {};
      if (options.tags) aliasMeta.tags = options.tags;
      if (options.rateLimit) aliasMeta.rateLimit = options.rateLimit;
      routes.push({
        method: "PATCH",
        path,
        handlers,
        meta: aliasMeta,
      });
    }
  }

  return routes;
}