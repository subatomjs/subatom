import { Request } from "../../modules/http/Request";
import { Response as SubatomResponse } from "../../modules/http/Response";

export type TypeHandler = (
  req: Request<any, any, any, any>,
  res: SubatomResponse,
  next: () => void | Promise<void>,
) => void | Promise<void>;

export interface TypeRoute {
  method: string;
  path: string;
  handlers: TypeHandler[];
  /**
   * Optional documentation/grouping tags accumulated from `app.group(...).tag(...)`.
   * Purely metadata — has no effect on request handling. Useful for route
   * listings, OpenAPI/Swagger generation, or admin dashboards.
   */
  tags?: string[];
  /**
   * Optional human-readable rate limit specification (e.g. "100/min") that was
   * declared on the group this route belongs to. The actual enforcement
   * middleware is already baked into `handlers`; this field is metadata only.
   */
  rateLimit?: string;
}

export interface MatchResult {
  route: TypeRoute;
  params: Record<string, string>;
  query: Record<string, string>;
}

/**
 * Shape of the optional metadata passed alongside a route registration
 * (tags / rate limit spec). Declared with explicit `| undefined` on each
 * property â€” rather than relying on the `?` optionality of TypeRoute's
 * fields â€” so this type remains assignable from call sites that build the
 * object from already-optional values (e.g. `context.rateLimitSpec`) even
 * under `exactOptionalPropertyTypes: true`, where `foo?: string` and
 * `foo?: string | undefined` are NOT interchangeable.
 */
export interface RouteMeta {
  tags?: string[] | undefined;
  rateLimit?: string | undefined;
}