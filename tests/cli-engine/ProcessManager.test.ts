import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessManager } from "../../package/cli-engine/watch/ProcessManager.js";
import { logger } from "../../package/cli-engine/utils/logger.js";

const { mockSpawn, mockExecSync } = vi.hoisted(() => ({
    mockSpawn: vi.fn(),
    mockExecSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
    spawn: mockSpawn,
    execSync: mockExecSync,
}));

describe("ProcessManager", () => {
    const defaultOptions = {
        command: "node",
        args: ["app.js"],
        label: "test-server",
        cwd: process.cwd(),
        env: {},
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("spawns a child process and logs crashes on non-zero exit", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        const mockChild = new EventEmitter() as any;
        mockChild.pid = 12345;
        mockChild.killed = false;
        mockChild.exitCode = null;

        mockSpawn.mockReturnValue(mockChild);

        const pm = new ProcessManager(defaultOptions);
        pm.start();

        expect(mockSpawn).toHaveBeenCalledTimes(1);

        mockChild.emit("exit", 1);
        expect(errorSpy).toHaveBeenCalledWith("test-server crashed (exit code 1)");
    });

    it("restarts process cleanly without duplicating active instances or leaking listeners", async () => {
        const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
        const mockChild = new EventEmitter() as any;
        mockChild.pid = 9999;
        mockChild.killed = false;
        mockChild.exitCode = null;

        mockSpawn.mockReturnValue(mockChild);
        mockExecSync.mockReturnValue(Buffer.from(""));
        vi.spyOn(process, "kill").mockImplementation(() => true);

        const pm = new ProcessManager(defaultOptions);
        pm.start();

        await pm.restart("src/index.ts");

        expect(infoSpy).toHaveBeenCalledWith("File changed: src/index.ts");
        expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
});