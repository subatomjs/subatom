import type {
  IHandler,
  IRouteMetaOptions,
  IRouteOptions,
} from "../../../types/framework/router/IRouter.js";

export interface ParsedRouteArgs {
  handlers: IHandler[];
  options: IRouteMetaOptions;
}

export function isRouteOptions(value: unknown): value is IRouteOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value !== "function" &&
    "controller" in value &&
    typeof (value as any).controller === "function"
  );
}

export function isRouteMetaOptions(value: unknown): value is IRouteMetaOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value !== "function" &&
    !("controller" in value)
  );
}

export function parseRouteArgs(
  args: Array<any>,
): ParsedRouteArgs {
  if (args.length === 0) {
    return { handlers: [], options: {} };
  }

  const last = args[args.length - 1];
  if (isRouteMetaOptions(last)) {
    return {
      handlers: args.slice(0, -1) as IHandler[],
      options: last,
    };
  }

  return { handlers: args as IHandler[], options: {} };
}