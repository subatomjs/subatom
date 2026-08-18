import { describe, it, expect, vi } from "vitest";
import { dispatchGroup } from "../../../../package/core/bootstrap/subatom/services/groupDispatcher.service.js";
import { Router } from "../../../../package/core/router/Router.js";
import { RouteGroupBuilder } from "../../../../package/core/bootstrap/subatom/subordinate/RouteGroupBuilder.js";
import * as routerMerger from "../../../../package/core/router/services/routerMerger.service.js";
import type { Subatom } from "../../../../package/core/bootstrap/subatom/Subatom.js";

vi.mock("../../../../package/core/router/services/routerMerger.service.js", () => ({
  mergeSubRouter: vi.fn(),
}));

describe("Unit: groupDispatcher.service", () => {
  const mockApp = {} as unknown as Subatom;
  const mockTargetRouter = new Router();

  it("should return a RouteGroupBuilder instance when router argument is undefined", () => {
    const result = dispatchGroup(mockApp, mockTargetRouter, "/api/v1");

    expect(result).toBeInstanceOf(RouteGroupBuilder);
  });

  it("should default to empty string prefix when called without prefix argument", () => {
    const result = dispatchGroup(mockApp, mockTargetRouter);

    expect(result).toBeInstanceOf(RouteGroupBuilder);
  });

  it("should merge router and return app when a Router instance is supplied", () => {
    const subRouter = new Router();
    const result = dispatchGroup(mockApp, mockTargetRouter, "/users", subRouter);

    expect(routerMerger.mergeSubRouter).toHaveBeenCalledWith(mockTargetRouter, "/users", subRouter);
    expect(result).toBe(mockApp);
  });

  it("should use empty string for prefix if non-string prefix is provided with Router instance", () => {
    const subRouter = new Router();
    const result = dispatchGroup(mockApp, mockTargetRouter, undefined, subRouter);

    expect(routerMerger.mergeSubRouter).toHaveBeenCalledWith(mockTargetRouter, "", subRouter);
    expect(result).toBe(mockApp);
  });

  it("should throw TypeError if router argument is provided but not an instance of Router", () => {
    expect(() => {
      dispatchGroup(mockApp, mockTargetRouter, "/api", {} as any);
    }).toThrow(TypeError);

    expect(() => {
      dispatchGroup(mockApp, mockTargetRouter, "/api", (() => {}) as any);
    }).toThrow("[Subatom] app.group(prefix, router) expects the second argument to be a Router instance.");
  });

  it("should throw TypeError if single argument prefix is provided but is not a string", () => {
    expect(() => {
      dispatchGroup(mockApp, mockTargetRouter, 1234 as any);
    }).toThrow(TypeError);

    expect(() => {
      dispatchGroup(mockApp, mockTargetRouter, 1234 as any);
    }).toThrow("[Subatom] app.group(prefix) expects 'prefix' to be a string.");
  });
});