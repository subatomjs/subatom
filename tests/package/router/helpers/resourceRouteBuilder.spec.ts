import { describe, expect, it } from "vitest";
import { buildResourceRoutes } from "../../../../package/core/router/helpers/resourceRouteBuilder.js";
import type { IResourceController } from "../../../../package/types/framework/router/IResourceRouter.js";
import type { IHandler } from "../../../../package/types/framework/router/IRouter.js";

describe("Unit: buildResourceRoutes", () => {
	const dummyHandler: IHandler = (_req, _res, next) => next();

	const fullController: IResourceController = {
		index: dummyHandler,
		create: dummyHandler,
		show: dummyHandler,
		update: dummyHandler,
		destroy: dummyHandler,
	};

	it("should generate full RESTful routes with PUT and PATCH for plural resource", () => {
		const routes = buildResourceRoutes("/users", fullController);

		expect(routes).toHaveLength(6); // index, create, show, update(PUT), update(PATCH), destroy
		expect(routes[0]).toMatchObject({
			method: "GET",
			path: "/users",
			meta: { name: "users.index" },
		});
		expect(routes[1]).toMatchObject({
			method: "POST",
			path: "/users",
			meta: { name: "users.create" },
		});
		expect(routes[2]).toMatchObject({
			method: "GET",
			path: "/users/:id",
			meta: { name: "users.show" },
		});
		expect(routes[3]).toMatchObject({
			method: "PUT",
			path: "/users/:id",
			meta: { name: "users.update" },
		});
		expect(routes[4]).toMatchObject({
			method: "PATCH",
			path: "/users/:id",
			meta: {},
		});
		expect(routes[5]).toMatchObject({
			method: "DELETE",
			path: "/users/:id",
			meta: { name: "users.destroy" },
		});
	});

	it("should support singular resource ordering without :id path params", () => {
		const routes = buildResourceRoutes("/profile", fullController, {
			singular: true,
		});

		expect(routes).toHaveLength(5); // create, show, update (PUT), update (PATCH), destroy
		expect(routes[0]).toMatchObject({
			method: "POST",
			path: "/profile",
			meta: { name: "profile.create" },
		});
		expect(routes[1]).toMatchObject({
			method: "GET",
			path: "/profile",
			meta: { name: "profile.show" },
		});
		expect(routes[2]).toMatchObject({
			method: "PUT",
			path: "/profile",
			meta: { name: "profile.update" },
		});
		expect(routes[3]).toMatchObject({ method: "PATCH", path: "/profile" });
		expect(routes[4]).toMatchObject({
			method: "DELETE",
			path: "/profile",
			meta: { name: "profile.destroy" },
		});
	});

	it("should respect allowPatch: false", () => {
		const routes = buildResourceRoutes(
			"/users",
			{ update: dummyHandler },
			{ allowPatch: false },
		);
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe("PUT");
	});

	it("should use custom param name when specified", () => {
		const routes = buildResourceRoutes(
			"/articles",
			{ show: dummyHandler },
			{ param: "slug" },
		);
		expect(routes[0].path).toBe("/articles/:slug");
	});

	it("should apply shared middleware to every route", () => {
		const mw: IHandler = (_req, _res, next) => next();
		const routes = buildResourceRoutes(
			"/users",
			{ index: dummyHandler },
			{ middleware: [mw] },
		);
		expect(routes[0].handlers).toEqual([mw, dummyHandler]);
	});

	it("should filter actions using 'only'", () => {
		const routes = buildResourceRoutes("/users", fullController, {
			only: ["index", "show"],
		});
		expect(routes.map((r) => r.meta?.name)).toEqual([
			"users.index",
			"users.show",
		]);
	});

	it("should filter actions using 'except'", () => {
		const routes = buildResourceRoutes("/users", fullController, {
			except: ["destroy", "update"],
		});
		expect(routes.map((r) => r.method)).toEqual(["GET", "POST", "GET"]);
	});

	it("should throw if basePath is missing or empty", () => {
		expect(() => buildResourceRoutes("", fullController)).toThrow(
			"[Subatom] router.resource: 'basePath' must be a non-empty string.",
		);
	});

	it("should throw if controller is missing or not an object", () => {
		expect(() =>
			buildResourceRoutes("/users", null as unknown as IResourceController),
		).toThrow(
			'[Subatom] router.resource("/users"): a controller object is required.',
		);
	});

	it("should throw if both only and except are provided", () => {
		expect(() =>
			buildResourceRoutes("/users", fullController, {
				only: ["index"],
				except: ["destroy"],
			}),
		).toThrow(
			"[Subatom] router.resource(\"/users\"): 'only' and 'except' are mutually exclusive.",
		);
	});

	it("should throw if invalid param contains slash or colon", () => {
		expect(() =>
			buildResourceRoutes("/users", fullController, { param: "id/bad" }),
		).toThrow(
			'[Subatom] router.resource("/users"): invalid param name "id/bad".',
		);
		expect(() =>
			buildResourceRoutes("/users", fullController, { param: ":id" }),
		).toThrow('[Subatom] router.resource("/users"): invalid param name ":id".');
	});

	it("should throw if 'only' contains actions invalid for resource structure or unimplemented", () => {
		expect(() =>
			buildResourceRoutes("/profile", fullController, {
				singular: true,
				only: ["index"],
			}),
		).toThrow(
			"[Subatom] router.resource(\"/profile\"): 'only' contains action(s) not valid for a singular resource: index.",
		);

		expect(() =>
			buildResourceRoutes(
				"/users",
				{ index: dummyHandler },
				{ only: ["show"] },
			),
		).toThrow(
			"[Subatom] router.resource(\"/users\"): 'only' requested action(s) not implemented on the controller: show.",
		);
	});

	it("should throw if middleware array contains non-functions", () => {
		expect(() =>
			buildResourceRoutes("/users", fullController, {
				middleware: ["bad" as unknown as IHandler],
			}),
		).toThrow(
			"[Subatom] router.resource(\"/users\"): 'middleware' must contain only functions.",
		);
	});
});
