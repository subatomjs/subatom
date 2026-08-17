import { describe, it, expect } from "vitest";
import { mergeSubRouter, mergeRouter } from "../../../../package/core/router/services/routerMerger.service.js";
import { Router } from "../../../../package/core/router/Router.js";

describe("Unit: routerMerger.service", () => {
    it("should merge sub-router routes with prefix applied", () => {
        const parent = new Router();
        const child = new Router();

        child.get("/comments", () => {});
        mergeSubRouter(parent, "/posts/:postId", child);

        const routes = parent.getRoutes();
        expect(routes).toHaveLength(1);
        expect(routes[0].path).toBe("/posts/:postId/comments");
    });

    it("should throw TypeError when route name collisions occur during merge", () => {
        const parent = new Router();
        const child = new Router();

        parent.get("/a", () => {}, { name: "common.name" });
        child.get("/b", () => {}, { name: "common.name" });

        expect(() => mergeSubRouter(parent, "/sub", child)).toThrow(TypeError);
        expect(() => mergeSubRouter(parent, "/sub", child)).toThrow(
            '[Subatom] Cannot mount router: route name "common.name"'
        );
    });

    it("should throw TypeError when target is not a valid Router instance", () => {
        const parent = new Router();
        expect(() => mergeSubRouter(parent, "/api", {} as unknown as Router)).toThrow(TypeError);
        expect(() => mergeRouter(parent, null as unknown as Router)).toThrow(TypeError);
    });

    it("should merge flat router without prefix using mergeRouter", () => {
        const parent = new Router();
        const other = new Router();

        other.post("/login", () => {});
        mergeRouter(parent, other);

        expect(parent.getRoutes()).toHaveLength(1);
        expect(parent.getRoutes()[0].path).toBe("/login");
    });
});