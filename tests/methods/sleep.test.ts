import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { sleep } from "../../packages/methods/sleep.js";

describe("sleep utility", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("sleep()", () => {
		test("resolves after specified milliseconds", async () => {
			const promise = sleep(1000);
			vi.advanceTimersByTime(999);
			let resolved = false;
			promise.then(() => {
				resolved = true;
			});

			expect(resolved).toBe(false);
			vi.advanceTimersByTime(1);
			await promise;
			expect(resolved).toBe(true);
		});

		test("clamps negative duration to 0", async () => {
			const promise = sleep(-100);
			vi.advanceTimersByTime(0);
			await expect(promise).resolves.toBeUndefined();
		});
	});

	describe("sleep.until()", () => {
		test("waits until target date", async () => {
			const now = Date.now();
			vi.setSystemTime(now);

			const target = new Date(now + 2500);
			const promise = sleep.until(target);

			vi.advanceTimersByTime(2500);
			await expect(promise).resolves.toBeUndefined();
		});

		test("resolves immediately if target date has passed", async () => {
			const now = Date.now();
			vi.setSystemTime(now);

			const pastDate = new Date(now - 1000);
			const promise = sleep.until(pastDate);

			vi.advanceTimersByTime(0);
			await expect(promise).resolves.toBeUndefined();
		});
	});

	describe("sleep.abortable()", () => {
		test("resolves when timer finishes before abort signal", async () => {
			const controller = new AbortController();
			const promise = sleep.abortable(1000, controller.signal);

			vi.advanceTimersByTime(1000);
			await expect(promise).resolves.toBeUndefined();
		});

		test("rejects immediately if signal is already aborted", async () => {
			const controller = new AbortController();
			controller.abort();

			await expect(
				sleep.abortable(1000, controller.signal),
			).rejects.toThrow("Aborted");
		});

		test("aborts and rejects mid-delay when abort event fires", async () => {
			const controller = new AbortController();
			const promise = sleep.abortable(5000, controller.signal);

			vi.advanceTimersByTime(2000);
			controller.abort();

			await expect(promise).rejects.toThrow("Aborted");
		});
	});
});