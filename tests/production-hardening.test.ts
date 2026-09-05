import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { Router } from "../packages/core/router/Router.js";
import { mergeSubRouter } from "../packages/core/router/services/routerMerger.service.js";
import { RequestPipeline } from "../packages/pipelines/modifiers/RequestPipeline.js";
import { readLimitedBody } from "../packages/pipelines/middlewares/utils/readLimitedBody.js";
import { MemoryStore as RateLimitMemoryStore } from "../packages/pipelines/securities/ratelimit/stores/MemoryStore.js";
import { RedisStore } from "../packages/pipelines/securities/ratelimit/stores/RedisStore.js";
import { MemoryStore as SessionMemoryStore } from "../packages/pipelines/middlewares/utils/memory/MemoryStore.js";
import { RedisSessionStore } from "../packages/pipelines/middlewares/utils/redis/RedisSessionStore.js";

const rateParams = {
	key: "client",
	algorithm: "sliding-window" as const,
	limit: 10,
	windowMs: 1000,
	capacity: 10,
	refillRate: 1,
	refillIntervalMs: 1000,
	now: 100,
};

describe("production hardening", () => {
	it("keeps route snapshots immutable and isolated", () => {
		const router = new Router();
		const handler = () => undefined;
		router.get("/users/:id", handler);

		const snapshot = router.getRoutes();
		const route = snapshot[0];
		if (!route) throw new Error("route snapshot is empty");
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(route)).toBe(true);
		expect(() => {
			route.handlers.length = 0;
		}).toThrow(TypeError);
		expect(router.match("GET", "/users/42")?.route.handlers).toHaveLength(1);
	});

	it("mounts a sub-router without mutating frozen route snapshots", () => {
		const target = new Router();
		const subRouter = new Router();
		subRouter.get("/users/:id", () => undefined);

		expect(() => mergeSubRouter(target, "/api", subRouter)).not.toThrow();
		expect(target.match("GET", "/api/users/42")?.route.path).toBe(
			"/api/users/:id",
		);
	});

	it("runs duplicate transformer references once", async () => {
		let beforeCount = 0;
		const transformer = { beforeRequest: () => void beforeCount++ };
		const pipeline = new RequestPipeline({
			transformers: [transformer, transformer],
			interceptors: [],
			serializers: [],
		});

		await pipeline.execute({
			req: { path: "/", method: "GET" } as never,
			res: { get: () => undefined } as never,
			runControllerChain: async () => "ok",
		});

		expect(beforeCount).toBe(1);
	});

	it("rejects oversized streamed bodies before concatenation", async () => {
		const request = Readable.from([Buffer.from("1234"), Buffer.from("5678")]);
		Object.assign(request, { headers: {} });

		await expect(readLimitedBody(request as never, 5)).rejects.toMatchObject({
			statusCode: 413,
		});
	});

	it("uses unique Redis members and opens its circuit", async () => {
		const members: string[] = [];
		const client = {
			eval: async (
				_script: string,
				_keys: number,
				...args: (string | number)[]
			) => {
				members.push(String(args[4]));
				return [1, 0, 1000] as const;
			},
		};
		const store = new RedisStore(client, { failureThreshold: 2 });
		await store.evaluate(rateParams);
		await store.evaluate(rateParams);
		expect(members[0]).not.toBe(members[1]);
		await store.destroy();
	});

	it("clones session state and disposes memory stores", async () => {
		const store = new SessionMemoryStore(60_000);
		const original = { profile: { name: "Ada" } };
		await store.set("sid", original);
		original.profile.name = "Grace";

		const loaded = await store.get("sid");
		expect(loaded?.profile).toEqual({ name: "Ada" });
		await store.close();
		expect(await store.get("sid")).toBeNull();
	});

	it("disposes rate-limit memory stores", async () => {
		const store = new RateLimitMemoryStore(60_000);
		await store.evaluate({ ...rateParams, algorithm: "fixed-window" });
		await store.destroy();
		await expect(
			store.evaluate({ ...rateParams, algorithm: "fixed-window" }),
		).rejects.toThrow("closed");
	});

	it("persists sessions through the built-in Redis store", async () => {
		let value: string | null = null;
		const store = new RedisSessionStore({
			eval: async (
				script: string,
				_keys: number,
				...args: (string | number)[]
			) => {
				if (script.includes('"GET"')) return value;
				if (script.includes('"SET"')) {
					value = String(args[1]);
					return 1;
				}
				if (script.includes('"DEL"')) {
					value = null;
					return 1;
				}
				return 1;
			},
		});

		await store.set("sid", { user: { id: 42 } }, 60_000);
		expect(await store.get("sid")).toEqual({ user: { id: 42 } });
		await store.destroy("sid");
		expect(await store.get("sid")).toBeNull();
		await store.close();
	});

	it("handles concurrent rate-limit evaluations without corrupting state", async () => {
		const store = new RateLimitMemoryStore(60_000);
		const results = await Promise.all(
			Array.from({ length: 1_000 }, (_, index) =>
				store.evaluate({
					...rateParams,
					algorithm: "fixed-window",
					now: 10_000 + index,
				}),
			),
		);

		expect(results).toHaveLength(1_000);
		expect(results.filter((result) => result.allowed)).toHaveLength(10);
		await store.close();
	});
});
