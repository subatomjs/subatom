import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sleep } from "../../../package/core/helpers/framework/sleep.js";

describe("Sleep Utility", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("sleep()", () => {
		it("pauses execution for the specified milliseconds", async () => {
			let resolved = false;
			const promise = sleep(1000).then(() => {
				resolved = true;
			});

			expect(resolved).toBe(false);

			await vi.advanceTimersByTimeAsync(999);
			expect(resolved).toBe(false);

			await vi.advanceTimersByTimeAsync(1);
			await promise;
			expect(resolved).toBe(true);
		});

		it("resolves immediately when given 0 or negative ms", async () => {
			let resolved = false;
			const promise = sleep(-100).then(() => {
				resolved = true;
			});

			await vi.advanceTimersByTimeAsync(0);
			await promise;
			expect(resolved).toBe(true);
		});
	});

	describe("sleep.until()", () => {
		it("sleeps until target date", async () => {
			const now = 1_700_000_000_000;
			vi.setSystemTime(now);

			const targetDate = new Date(now + 5000);
			let resolved = false;
			const promise = sleep.until(targetDate).then(() => {
				resolved = true;
			});

			await vi.advanceTimersByTimeAsync(4999);
			expect(resolved).toBe(false);

			await vi.advanceTimersByTimeAsync(1);
			await promise;
			expect(resolved).toBe(true);
		});

		it("resolves immediately if target date is in the past", async () => {
			const now = 1_700_000_000_000;
			vi.setSystemTime(now);

			const pastDate = new Date(now - 5000);
			let resolved = false;
			const promise = sleep.until(pastDate).then(() => {
				resolved = true;
			});

			await vi.advanceTimersByTimeAsync(0);
			await promise;
			expect(resolved).toBe(true);
		});
	});

	describe("sleep.abortable()", () => {
		it("resolves when timer completes before abort signal fires", async () => {
			const controller = new AbortController();
			let resolved = false;

			const promise = sleep.abortable(2000, controller.signal).then(() => {
				resolved = true;
			});

			await vi.advanceTimersByTimeAsync(2000);
			await promise;
			expect(resolved).toBe(true);
		});

		it("rejects immediately if signal is already aborted", async () => {
			const controller = new AbortController();
			controller.abort();

			await expect(sleep.abortable(2000, controller.signal)).rejects.toThrow(
				"Aborted",
			);
		});

		it("rejects when abort signal is triggered mid-delay", async () => {
			const controller = new AbortController();
			const promise = sleep.abortable(2000, controller.signal);

			await vi.advanceTimersByTimeAsync(1000);
			controller.abort();

			await expect(promise).rejects.toThrow("Aborted");
		});
	});
});
