import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import { resolveEnvironmentFiles, getEnvConfigOverride } from "../../../package/config/env/EnvResolver.js";

vi.mock("node:fs");

describe("EnvResolver", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("resolves environment files in highest-to-lowest precedence order", () => {
        process.env.NODE_ENV = "production";
        const loadedFiles: string[] = [];

        vi.spyOn(fs, "existsSync").mockImplementation((p) => {
            loadedFiles.push(p.toString());
            return false;
        });

        resolveEnvironmentFiles();

        expect(loadedFiles).toEqual([
            expect.stringContaining(".env.production.local"),
            expect.stringContaining(".env.production"),
            expect.stringContaining(".env.local"),
            expect.stringContaining(".env"),
        ]);
    });

    it("extracts explicit environment overrides into SubatomUserConfig", () => {
        process.env.PORT = "4000";
        process.env.HOST = "0.0.0.0";
        process.env.SUBATOM_ENTRY = "src/main.ts";
        process.env.SUBATOM_OUTDIR = "build";
        process.env.SUBATOM_SOURCEMAP = "false";
        process.env.SUBATOM_MINIFY = "true";
        process.env.SUBATOM_WEBSOCKET = "1";

        const override = getEnvConfigOverride();

        expect(override).toEqual({
            port: 4000,
            host: "0.0.0.0",
            entry: "src/main.ts",
            outDir: "build",
            sourcemap: false,
            minify: true,
            websocket: true,
        });
    });

    it("returns an empty object when no related environment variables are set", () => {
        delete process.env.PORT;
        delete process.env.HOST;
        delete process.env.SUBATOM_ENTRY;
        delete process.env.SUBATOM_OUTDIR;
        delete process.env.SUBATOM_SOURCEMAP;
        delete process.env.SUBATOM_MINIFY;
        delete process.env.SUBATOM_WEBSOCKET;

        const override = getEnvConfigOverride();
        expect(override).toEqual({});
    });
});