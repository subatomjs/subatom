import { describe, expect, it, vi } from "vitest";
import { resolveKey } from "../../../../packages/pipelines/securities/ratelimit/resolveKey.js";
import type { IRequest } from "../../../../packages/core/http/request/types/request.types.js";

describe("resolveKey", () => {
	const createRequest = (overrides: Partial<IRequest> = {}): IRequest => {
		return {
			ip: "",
			url: "/api/test",
			path: "/api/test",
			headers: {},
			raw: {
				socket: {
					remoteAddress: "127.0.0.1",
				},
			},
			...overrides,
		} as unknown as IRequest;
	};

	it("should execute custom resolver function and cast result to string", async () => {
		const req = createRequest();
		const resolver = vi.fn(async () => 12345);

		const key = await resolveKey(req, resolver as unknown as (r: IRequest) => string);

		expect(resolver).toHaveBeenCalledWith(req);
		expect(key).toBe("12345");
	});

	describe("resolver: 'ip'", () => {
		it("should return req.ip when defined", async () => {
			const req = createRequest({ ip: "192.168.1.1" });
			expect(await resolveKey(req, "ip")).toBe("192.168.1.1");
		});

		it("should fallback to raw socket remoteAddress when req.ip is not available", async () => {
			const req = createRequest({ ip: "" });
			expect(await resolveKey(req, "ip")).toBe("127.0.0.1");
		});

		it("should fallback to 0.0.0.0 when neither req.ip nor remoteAddress are present", async () => {
			const req = createRequest({
				ip: "",
				raw: { socket: {} } as unknown as IRequest["raw"],
			});
			expect(await resolveKey(req, "ip")).toBe("0.0.0.0");
		});
	});

	describe("resolver: 'user'", () => {
		it("should return user key if req.user has an id", async () => {
			const req = createRequest({
				user: { id: "user_99" },
			} as unknown as Partial<IRequest>);
			expect(await resolveKey(req, "user")).toBe("user:user_99");
		});

		it("should fallback to ip resolution if user is missing or has no id", async () => {
			const req = createRequest({ ip: "10.0.0.1", user: null } as unknown as Partial<IRequest>);
			expect(await resolveKey(req, "user")).toBe("10.0.0.1");
		});
	});

	describe("resolver: 'api-key'", () => {
		it("should hash x-api-key header when present", async () => {
			const req = createRequest({
				headers: { "x-api-key": "secret-key-123" },
			});
			const key = await resolveKey(req, "api-key");
			expect(key).toMatch(/^apikey:[a-z0-9-]+$/);
			expect(key).not.toContain("secret-key-123");
		});

		it("should fallback to authorization header if x-api-key is missing", async () => {
			const req = createRequest({
				headers: { authorization: "Bearer token" },
			});
			const key = await resolveKey(req, "api-key");
			expect(key).toMatch(/^apikey:[a-z0-9-]+$/);
		});

		it("should fallback to ip if no api-key headers are present", async () => {
			const req = createRequest({ ip: "10.0.0.2", headers: {} });
			expect(await resolveKey(req, "api-key")).toBe("10.0.0.2");
		});
	});

	describe("resolver: 'tenant'", () => {
		it("should return tenant id if req.tenant.id exists", async () => {
			const req = Object.assign(createRequest(), {
				tenant: { id: "corp_xyz" },
			});
			expect(await resolveKey(req, "tenant")).toBe("tenant:corp_xyz");
		});

		it("should fallback to ip if tenant extension is missing", async () => {
			const req = createRequest({ ip: "192.168.0.5" });
			expect(await resolveKey(req, "tenant")).toBe("192.168.0.5");
		});
	});

	describe("resolver: 'route'", () => {
		it("should prefix route with baseUrl and prefer req.path", async () => {
			const req = Object.assign(createRequest({ path: "/users", url: "/users?page=1" }), {
				baseUrl: "/v1",
			});
			expect(await resolveKey(req, "route")).toBe("route:/v1/users");
		});

		it("should use req.url if req.path is undefined", async () => {
			const req = createRequest({ path: "", url: "/fallback" });
			expect(await resolveKey(req, "route")).toBe("route:/fallback");
		});
	});

	describe("resolver: 'composite'", () => {
		it("should combine ip and path", async () => {
			const req = createRequest({ ip: "127.0.0.1", path: "/login" });
			expect(await resolveKey(req, "composite")).toBe("127.0.0.1:/login");
		});
	});

	it("should default to IP resolution for unsupported resolver string types", async () => {
		const req = createRequest({ ip: "172.16.0.1" });
		expect(await resolveKey(req, "unknown-type" as unknown as "ip")).toBe("172.16.0.1");
	});
});