import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import { findAndLoadConfig, defineConfig } from "../../../package/config/load.config.js";
import { DEFAULT_CONFIG } from "../../../package/config/default.config.js";

vi.mock("node:fs");

describe("findAndLoadConfig", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns DEFAULT_CONFIG if no config file exists in the directory", async () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(false);
        const config = await findAndLoadConfig("/fake/dir");
        expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("loads and parses a .json config file", async () => {
        vi.spyOn(fs, "existsSync").mockImplementation((p) => p.toString().endsWith("subatom.config.json"));
        vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ port: 4200, minify: true }));

        const config = await findAndLoadConfig("/fake/dir");
        expect(config.port).toBe(4200);
        expect(config.minify).toBe(true);
        expect(config.host).toBe(DEFAULT_CONFIG.host);
    });

    it("falls back to DEFAULT_CONFIG and warns if file reading/parsing throws", async () => {
        vi.spyOn(fs, "existsSync").mockImplementation((p) => p.toString().endsWith("subatom.config.json"));
        vi.spyOn(fs, "readFileSync").mockImplementation(() => {
            throw new Error("Corrupted JSON");
        });
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const config = await findAndLoadConfig("/fake/dir");
        expect(config).toEqual(DEFAULT_CONFIG);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("[subatom] Failed to load config from subatom.config.json"),
            expect.any(Error),
        );
    });

    it("defineConfig returns the exact object passed to it", () => {
        const input = { port: 3000 };
        expect(defineConfig(input)).toBe(input);
    });
});