// core/router/helpers/buildUrl.ts

/**
 * Substitutes :param segments in a route pattern with concrete values,
 * and appends any remaining params as a query string.
 *
 * Throws if a required :param has no matching value supplied — a
 * silently-wrong URL (e.g. "/users/undefined") is worse than a loud
 * failure at the call site that generated it.
 */
export function buildUrl(
  routePath: string,
  params: Record<string, string | number> = {},
  query?: Record<string, string | number | boolean>,
): string {
  const usedKeys = new Set<string>();

  const resolvedPath = routePath
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;

      const paramName = segment.slice(1);
      const value = params[paramName];

      if (value === undefined || value === null || value === "") {
        throw new Error(
          `[Subatom] urlFor: missing required param ":${paramName}" for route "${routePath}".`,
        );
      }

      usedKeys.add(paramName);
      return encodeURIComponent(String(value));
    })
    .join("/");

  const extraParamKeys = Object.keys(params).filter(
    (key) => !usedKeys.has(key),
  );

  if (extraParamKeys.length > 0) {
    throw new Error(
      `[Subatom] urlFor: received param(s) not present in route "${routePath}": ${extraParamKeys.join(", ")}. ` +
        `If these are meant to be query params, pass them via the separate "query" argument instead.`,
    );
  }

  if (!query || Object.keys(query).length === 0) {
    return resolvedPath;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    searchParams.set(key, String(value));
  }

  return `${resolvedPath}?${searchParams.toString()}`;
}