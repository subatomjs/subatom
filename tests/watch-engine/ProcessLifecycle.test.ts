/// <reference types="node" />
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ProcessLifecycle } from "../../package/watch-engine/lifecycle/ProcessLifecycle.js";

describe("ProcessLifecycle", () => {
    beforeEach(() => {
        ProcessLifecycle.resetInstanceForTesting();
    });

    afterEach(() => {
        ProcessLifecycle.resetInstanceForTesting();
        vi.restoreAllMocks();
    });

    it("registers exactly one listener set regardless of repeated initializations", () => {
        const sigintListenersBefore = process.listenerCount("SIGINT");
        const sigtermListenersBefore = process.listenerCount("SIGTERM");

        const lifecycle = ProcessLifecycle.getInstance();
        lifecycle.initialize();
        lifecycle.initialize();
        lifecycle.initialize();

        expect(process.listenerCount("SIGINT")).toBe(sigintListenersBefore + 1);
        expect(process.listenerCount("SIGTERM")).toBe(sigtermListenersBefore + 1);
    });

    it("executes all registered shutdown hooks on handleShutdown", async () => {
        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        const lifecycle = ProcessLifecycle.getInstance();

        let hookAExecuted = false;
        let hookBExecuted = false;

        lifecycle.onShutdown(async () => {
            hookAExecuted = true;
        });
        lifecycle.onShutdown(async () => {
            hookBExecuted = true;
        });

        await lifecycle.handleShutdown("SIGINT");

        expect(hookAExecuted).toBe(true);
        expect(hookBExecuted).toBe(true);
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("allows unregistering shutdown hooks", async () => {
        vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        const lifecycle = ProcessLifecycle.getInstance();

        let executed = false;
        const reg = lifecycle.onShutdown(() => {
            executed = true;
        });

        reg.unregister();
        await lifecycle.handleShutdown("SIGTERM");

        expect(executed).toBe(false);
    });
});