import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../../package/core/factory-functions/utils/MemoryStore.js";

describe("MemoryStore Session Store", () => {
	let store: MemoryStore;

	beforeEach(() => {
		vi.useFakeTimers();
		store = new MemoryStore();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should return null for non-existent session id", async () => {
		const result = await store.get("non-existent-sid");
		expect(result).toBeNull();
	});

	it("should save and retrieve session data without expiration", async () => {
		const data = { user: "Kunal", role: "admin" };
		await store.set("sid-1", data);

		const retrieved = await store.get("sid-1");
		expect(retrieved).toEqual(data);
	});

	it("should expire sessions when maxAge is provided and time elapses", async () => {
		const data = { token: "secret" };
		await store.set("sid-exp", data, 5000); // 5 seconds TTL

		expect(await store.get("sid-exp")).toEqual(data);

		// Advance past expiration
		vi.advanceTimersByTime(5001);

		expect(await store.get("sid-exp")).toBeNull();
		// Verifying eviction from internal map
		expect(await store.get("sid-exp")).toBeNull();
	});

	it("should delete session on destroy", async () => {
		await store.set("sid-del", { authenticated: true });
		await store.destroy("sid-del");

		expect(await store.get("sid-del")).toBeNull();
	});

	it("should touch and extend session TTL", async () => {
		await store.set("sid-touch", { counter: 1 }, 2000);

		vi.advanceTimersByTime(1500);
		// Extend by another 2000ms
		await store.touch("sid-touch", 2000);

		vi.advanceTimersByTime(1000);
		// Total elapsed 2500ms, but touch should keep it alive
		expect(await store.get("sid-touch")).toEqual({ counter: 1 });

		vi.advanceTimersByTime(1500);
		expect(await store.get("sid-touch")).toBeNull();
	});

	it("touch on non-existent session should be a safe no-op", async () => {
		await expect(store.touch("non-existent", 5000)).resolves.toBeUndefined();
	});

	it("touch without maxAgeMs should reset expiration to null", async () => {
		await store.set("sid-reset", { keepAlive: true }, 2000);
		await store.touch("sid-reset", undefined);

		vi.advanceTimersByTime(10000);
		expect(await store.get("sid-reset")).toEqual({ keepAlive: true });
	});
});
