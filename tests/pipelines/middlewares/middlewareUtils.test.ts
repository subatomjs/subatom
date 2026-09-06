import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { parseLimit } from "../../../packages/pipelines/middlewares/utils/limit/parseLimit.js";
import { parseCookieHeader } from "../../../packages/pipelines/middlewares/utils/cookies/parseCookieHeader.js";
import { serializeCookie } from "../../../packages/pipelines/middlewares/utils/cookies/serializeCookie.js";
import {
	sign,
	unsign,
} from "../../../packages/pipelines/middlewares/utils/signatures/signatures.js";
import { getMimeType } from "../../../packages/pipelines/middlewares/utils/mime/mime.js";
import {
	readLimitedBody,
	isPayloadTooLarge,
} from "../../../packages/pipelines/middlewares/utils/readLimitedBody.js";
import { MemoryStore } from "../../../packages/pipelines/middlewares/utils/memory/MemoryStore.js";
import {
	RedisSessionStore,
	type RedisSessionClient,
} from "../../../packages/pipelines/middlewares/utils/redis/RedisSessionStore.js";
import {
	BadRequestError,
	PayloadTooLargeError,
} from "../../../packages/errors/Errors.js";

describe("Middleware Utilities", () => {
	describe("parseLimit", () => {
		it("should return the number directly if numeric value provided", () => {
			expect(parseLimit(2048)).toBe(2048);
		});

		it("should parse unit notations correctly", () => {
			expect(parseLimit("500b")).toBe(500);
			expect(parseLimit("2kb")).toBe(2 * 1024);
			expect(parseLimit("1.5mb")).toBe(1.5 * 1024 * 1024);
			expect(parseLimit("1gb")).toBe(1024 * 1024 * 1024);
			expect(parseLimit("200")).toBe(200); // defaults unit to 'b'
		});

		it("should fallback to 1MB when limit string is malformed or invalid unit", () => {
			expect(parseLimit("invalid-size")).toBe(1024 * 1024);
			expect(parseLimit("100tb")).toBe(100); // unit not in dictionary falls back to value * 1
		});
	});

	describe("parseCookieHeader", () => {
		it("should return empty object on undefined or empty header", () => {
			expect(parseCookieHeader(undefined)).toEqual({});
			expect(parseCookieHeader("")).toEqual({});
		});

		it("should parse and decode valid cookies and skip empty or malformed pairs", () => {
			const parsed = parseCookieHeader(
				"user=John%20Doe; session=abc123; invalidCookie; =noName; ;   ",
			);
			expect(parsed).toEqual({
				user: "John Doe",
				session: "abc123",
			});
		});

		it("should fall back to raw value if decodeURIComponent fails", () => {
			const parsed = parseCookieHeader("malformed=%E0%A4%A");
			expect(parsed).toEqual({ malformed: "%E0%A4%A" });
		});
	});

	describe("serializeCookie", () => {
		it("should serialize basic name-value pair", () => {
			expect(serializeCookie("sid", "123")).toBe("sid=123; Path=/");
		});

		it("should serialize options correctly", () => {
			const date = new Date("2026-01-01T00:00:00Z");
			const serialized = serializeCookie("sid", "abc", {
				httpOnly: true,
				secure: true,
				maxAge: 60000,
				domain: "subatomjs.dev",
				path: "/api",
				sameSite: "lax",
				expires: date,
			});

			expect(serialized).toContain("sid=abc");
			expect(serialized).toContain("Max-Age=60");
			expect(serialized).toContain("Domain=subatomjs.dev");
			expect(serialized).toContain("Path=/api");
			expect(serialized).toContain(`Expires=${date.toUTCString()}`);
			expect(serialized).toContain("HttpOnly");
			expect(serialized).toContain("Secure");
			expect(serialized).toContain("SameSite=Lax");
		});

		it("should support sameSite=true as Strict", () => {
			const serialized = serializeCookie("sid", "abc", { sameSite: true });
			expect(serialized).toContain("SameSite=Strict");
		});
	});

	describe("signatures (sign / unsign)", () => {
		const secret = "super-secret-key";

		it("should sign and verify valid payload", () => {
			const signed = sign("session-123", secret);
			expect(signed).toContain("session-123.");
			expect(unsign(signed, secret)).toBe("session-123");
		});

		it("should return false when tampering with payload or signature", () => {
			const signed = sign("session-123", secret);
			expect(unsign("session-123", secret)).toBe(false); // missing dot
			expect(unsign(`${signed}extra`, secret)).toBe(false); // length mismatch
			expect(unsign(`${signed.slice(0, -1)}x`, secret)).toBe(false); // bad hmac
		});
	});

	describe("mime", () => {
		it("should resolve correct mime types for recognized extensions", () => {
			expect(getMimeType("index.html")).toBe("text/html; charset=utf-8");
			expect(getMimeType("style.css")).toBe("text/css; charset=utf-8");
			expect(getMimeType("image.PNG")).toBe("image/png");
		});

		it("should fallback to application/octet-stream for unknown extensions", () => {
			expect(getMimeType("file.unknownext")).toBe("application/octet-stream");
		});
	});

	describe("readLimitedBody & isPayloadTooLarge", () => {
		it("should verify payload too large type check", () => {
			expect(isPayloadTooLarge(new PayloadTooLargeError("limit"))).toBe(true);
			expect(isPayloadTooLarge(new Error("generic"))).toBe(false);
		});

		it("should throw BadRequestError if content-length is not a valid number string", async () => {
			const req = new IncomingMessage(new Socket());
			req.headers["content-length"] = "not-a-number";
			const resumeSpy = vi.spyOn(req, "resume");

			await expect(readLimitedBody(req, 1024)).rejects.toThrow(BadRequestError);
			expect(resumeSpy).toHaveBeenCalled();
		});

		it("should throw BadRequestError if content-length exceeds safe integer limit", async () => {
			const req = new IncomingMessage(new Socket());
			req.headers["content-length"] = "9999999999999999999999";

			await expect(readLimitedBody(req, 1024)).rejects.toThrow(BadRequestError);
		});

		it("should throw PayloadTooLargeError if content-length header exceeds limit", async () => {
			const req = new IncomingMessage(new Socket());
			req.headers["content-length"] = "2048";

			await expect(readLimitedBody(req, 1024)).rejects.toThrow(
				PayloadTooLargeError,
			);
		});

		it("should read stream chunks within limit successfully, converting non-buffer chunks", async () => {
			const req = new IncomingMessage(new Socket());
			req.headers["content-length"] = "5";

			const promise = readLimitedBody(req, 10);
			// Push string chunk to hit !Buffer.isBuffer branch
			req.push("hello");
			req.push(null);

			const result = await promise;
			expect(result.toString()).toBe("hello");
		});

		it("should throw PayloadTooLargeError when stream exceeds maxBytes during chunks", async () => {
			const req = new IncomingMessage(new Socket());

			const promise = readLimitedBody(req, 4);
			req.push(Buffer.from("hello"));
			req.push(null);

			await expect(promise).rejects.toThrow(PayloadTooLargeError);
		});
	});

	describe("MemoryStore", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should store, retrieve, touch, and destroy sessions", async () => {
			const store = new MemoryStore(5000);
			await store.set("s1", { user: "alice" }, 1000);

			expect(await store.get("s1")).toEqual({ user: "alice" });

			await store.touch("s1", 3000);
			vi.advanceTimersByTime(2000);
			expect(await store.get("s1")).toEqual({ user: "alice" });

			vi.advanceTimersByTime(2000);
			expect(await store.get("s1")).toBeNull();

			// Touch non-existent session
			await store.touch("non-existent", 1000);

			// Touch with non-number maxAgeMs
			await store.set("s3", { item: 1 });
			await store.touch("s3", undefined);

			await store.set("s2", { user: "bob" });
			await store.destroy("s2");
			expect(await store.get("s2")).toBeNull();

			await store.close();
		});

		it("should automatically clean up expired sessions on timer interval", async () => {
			const store = new MemoryStore(1000);
			await store.set("s1", { user: "expiring" }, 500);

			vi.advanceTimersByTime(1100);
			expect(await store.get("s1")).toBeNull();

			await store.close();
		});

		it("should guard operations when closed", async () => {
			const store = new MemoryStore(1000);
			await store.close();

			expect(await store.get("s1")).toBeNull();
			await expect(store.set("s1", {})).rejects.toThrow(
				"MemoryStore is closed.",
			);
			await expect(store.destroy("s1")).resolves.toBeUndefined();
			await expect(store.touch("s1")).resolves.toBeUndefined();
			await expect(store.close()).resolves.toBeUndefined();
		});
	});

	describe("RedisSessionStore", () => {
		let client: RedisSessionClient;

		beforeEach(() => {
			client = {
				eval: vi.fn(),
			};
		});

		it("should fallback constructor options to defaults when non-integers or invalid types are supplied", () => {
			const store = new RedisSessionStore(client, {
				timeoutMs: -10,
				retries: -5,
				retryDelayMs: "bad" as unknown as number,
			});
			expect(store).toBeDefined();
		});

		it("should get session data and parse json payload", async () => {
			vi.mocked(client.eval).mockResolvedValueOnce(
				JSON.stringify({ role: "admin" }),
			);
			const store = new RedisSessionStore(client, { prefix: "app:" });

			const result = await store.get("sid-1");
			expect(result).toEqual({ role: "admin" });
			expect(client.eval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call("GET"'),
				1,
				"app:sid-1",
			);
		});

		it("should return null for missing or invalid JSON", async () => {
			vi.mocked(client.eval).mockResolvedValueOnce(null);
			const store = new RedisSessionStore(client);
			expect(await store.get("empty")).toBeNull();

			vi.mocked(client.eval).mockResolvedValueOnce("invalid-json");
			expect(await store.get("bad")).toBeNull();

			vi.mocked(client.eval).mockResolvedValueOnce(
				JSON.stringify(["not-object"]),
			);
			expect(await store.get("arr")).toBeNull();
		});

		it("should set, destroy, and touch sessions in Redis", async () => {
			vi.mocked(client.eval).mockResolvedValue(1);
			const store = new RedisSessionStore(client);

			await store.set("sid-1", { foo: "bar" }, 5000);
			expect(client.eval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call("SET"'),
				1,
				"subatom:session:sid-1",
				JSON.stringify({ foo: "bar" }),
				5000,
			);

			await store.destroy("sid-1");
			expect(client.eval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call("DEL"'),
				1,
				"subatom:session:sid-1",
			);

			await store.touch("sid-1", 10000);
			expect(client.eval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call("PEXPIRE"'),
				1,
				"subatom:session:sid-1",
				10000,
			);

			await store.touch("sid-1", 0);
			await store.touch("sid-1", -5);
			await store.touch("sid-1", undefined);
		});

		it("should retry operations upon failure with delay and throw if retries exceeded", async () => {
			vi.mocked(client.eval)
				.mockRejectedValueOnce(new Error("Connection reset"))
				.mockResolvedValueOnce(1);

			const store = new RedisSessionStore(client, {
				retries: 1,
				retryDelayMs: 5,
			});
			await expect(store.destroy("s1")).resolves.toBeUndefined();
			expect(client.eval).toHaveBeenCalledTimes(2);

			vi.mocked(client.eval).mockRejectedValue("Non-error string thrown");
			await expect(store.destroy("s2")).rejects.toThrow(
				"Non-error string thrown",
			);
		});

		it("should timeout long-running calls", async () => {
			vi.mocked(client.eval).mockImplementationOnce(
				() => new Promise((resolve) => setTimeout(resolve, 50)),
			);

			const store = new RedisSessionStore(client, {
				timeoutMs: 10,
				retries: 0,
			});
			await expect(store.destroy("timeout-key")).rejects.toThrow(
				"Redis session operation timed out.",
			);
		});

		it("should reject operations after store is closed", async () => {
			const store = new RedisSessionStore(client);
			await store.close();

			await expect(store.get("closed")).rejects.toThrow(
				"RedisSessionStore is closed.",
			);
		});
	});
});
