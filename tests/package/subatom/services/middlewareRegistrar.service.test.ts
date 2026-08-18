import { describe, it, expect } from "vitest";
import { registerMiddleware } from "../../../../package/core/bootstrap/subatom/services/middlewareRegistrar.service.js";
import type { MiddlewareHandler, ErrorMiddlewareHandler } from "../../../../package/types/http/IMiddleware.js";

describe("Unit: middlewareRegistrar.service", () => {
  it("should register standard 3-arity middleware (req, res, next) into middlewares array", () => {
    const middlewares: MiddlewareHandler[] = [];
    const errorMiddlewares: ErrorMiddlewareHandler[] = [];

    const standardMiddleware = (_req: any, _res: any, _next: any) => {};
    expect(standardMiddleware.length).toBe(3);

    registerMiddleware(middlewares, errorMiddlewares, standardMiddleware);

    expect(middlewares).toHaveLength(1);
    expect(middlewares[0]).toBe(standardMiddleware);
    expect(errorMiddlewares).toHaveLength(0);
  });

  it("should register 2-arity middleware (req, res) into standard middlewares array", () => {
    const middlewares: MiddlewareHandler[] = [];
    const errorMiddlewares: ErrorMiddlewareHandler[] = [];

    const twoParamMiddleware = (_req: any, _res: any) => {};
    expect(twoParamMiddleware.length).toBe(2);

    registerMiddleware(middlewares, errorMiddlewares, twoParamMiddleware);

    expect(middlewares).toHaveLength(1);
    expect(middlewares[0]).toBe(twoParamMiddleware);
    expect(errorMiddlewares).toHaveLength(0);
  });

  it("should register 4-arity error middleware (err, req, res, next) into errorMiddlewares array", () => {
    const middlewares: MiddlewareHandler[] = [];
    const errorMiddlewares: ErrorMiddlewareHandler[] = [];

    const errorMiddleware = (_err: any, _req: any, _res: any, _next: any) => {};
    expect(errorMiddleware.length).toBe(4);

    registerMiddleware(middlewares, errorMiddlewares, errorMiddleware);

    expect(middlewares).toHaveLength(0);
    expect(errorMiddlewares).toHaveLength(1);
    expect(errorMiddlewares[0]).toBe(errorMiddleware);
  });

  it("should do nothing when passed non-function inputs", () => {
    const middlewares: MiddlewareHandler[] = [];
    const errorMiddlewares: ErrorMiddlewareHandler[] = [];

    registerMiddleware(middlewares, errorMiddlewares, null);
    registerMiddleware(middlewares, errorMiddlewares, undefined);
    registerMiddleware(middlewares, errorMiddlewares, "not-a-function");
    registerMiddleware(middlewares, errorMiddlewares, {});
    registerMiddleware(middlewares, errorMiddlewares, 12345);

    expect(middlewares).toHaveLength(0);
    expect(errorMiddlewares).toHaveLength(0);
  });
});