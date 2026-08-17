/// <reference types="node" />
// tests/config/unit/findAndLoadConfig.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import path from "node:path";
import {
  findAndLoadConfig,
  defineConfig,
} from "../../../package/config/load.config.js";
import { DEFAULT_CONFIG } from "../../../package/config/default.config.js";

// Mock node:fs to control file existence and contents without disk side-effects
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe("findAndLoadConfig & defineConfig", () => {
  const mockCwd = "/test-project";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. defineConfig helper
  // ---------------------------------------------------------------------------
  describe("defineConfig", () => {
    it("returns the exact configuration object passed to it", () => {
      const config = { port: 8080, host: "0.0.0.0" } as any;
      expect(defineConfig(config)).toBe(config);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Default fallback & File Detection
  // ---------------------------------------------------------------------------
  describe("findAndLoadConfig - Detection & Defaults", () => {
    it("returns DEFAULT_CONFIG when no configuration file is found", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await findAndLoadConfig(mockCwd);

      expect(result).toEqual(DEFAULT_CONFIG);
      expect(fs.existsSync).toHaveBeenCalledTimes(5);
    });

    it("uses process.cwd() as default parameter when cwd argument is omitted", async () => {
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(mockCwd);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await findAndLoadConfig();

      expect(cwdSpy).toHaveBeenCalled();
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("respects file precedence and stops at the first matching configuration file", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const filePath = String(p);
        return (
          filePath === path.join(mockCwd, "subatom.config.ts") ||
          filePath === path.join(mockCwd, "subatom.config.json")
        );
      });

      vi.mocked(fs.readFileSync).mockReturnValue(
        "export default { port: 4000 };",
      );

      const result = await findAndLoadConfig(mockCwd);

      expect(result.port).toBe(4000);
      expect(vi.mocked(fs.existsSync).mock.calls[0][0]).toBe(
        path.join(mockCwd, "subatom.config.ts"),
      );
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. JSON Configuration
  // ---------------------------------------------------------------------------
  describe("findAndLoadConfig - JSON Handling", () => {
    it("loads and merges JSON configuration correctly", async () => {
      const targetPath = path.join(mockCwd, "subatom.config.json");

      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === targetPath,
      );
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ port: 9000, debug: true }),
      );

      const result = await findAndLoadConfig(mockCwd);

      expect(fs.readFileSync).toHaveBeenCalledWith(targetPath, "utf-8");
      expect(result).toEqual({ ...DEFAULT_CONFIG, port: 9000, debug: true });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. JS/TS Dynamic Import & esbuild In-Memory Transpile Fallback
  // ---------------------------------------------------------------------------
  describe("findAndLoadConfig - Dynamic Import & Transpilation", () => {
    it("loads config with default export via direct import or fallback", async () => {
      const targetPath = path.join(mockCwd, "subatom.config.js");

      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === targetPath,
      );
      vi.mocked(fs.readFileSync).mockReturnValue(
        "export default { port: 5050 };",
      );

      const result = await findAndLoadConfig(mockCwd);

      expect(result.port).toBe(5050);
      expect(result).toMatchObject({ ...DEFAULT_CONFIG, port: 5050 });
    });

    it("loads config with named exports (no default export) correctly", async () => {
      const targetPath = path.join(mockCwd, "subatom.config.ts");

      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === targetPath,
      );
      // Module exporting properties directly without `default`
      vi.mocked(fs.readFileSync).mockReturnValue("export const port = 7070;");

      const result = await findAndLoadConfig(mockCwd);

      expect(result.port).toBe(7070);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Error Handling & Fail-Safe Recovery
  // ---------------------------------------------------------------------------
  describe("findAndLoadConfig - Error Handling", () => {
    it("logs warning and returns DEFAULT_CONFIG when JSON parsing throws syntax error", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const targetPath = path.join(mockCwd, "subatom.config.json");

      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === targetPath,
      );
      vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json syntax");

      const result = await findAndLoadConfig(mockCwd);

      expect(result).toEqual(DEFAULT_CONFIG);
      expect(warnSpy).toHaveBeenCalledWith(
        "[subatom] Failed to load config from subatom.config.json",
        expect.any(SyntaxError),
      );
    });

    it("logs warning and returns DEFAULT_CONFIG when module fails to evaluate completely", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const targetPath = path.join(mockCwd, "subatom.config.ts");

      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === targetPath,
      );
      // Throw an error during readFileSync
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("EACCES: permission denied");
      });

      const result = await findAndLoadConfig(mockCwd);

      expect(result).toEqual(DEFAULT_CONFIG);
      expect(warnSpy).toHaveBeenCalledWith(
        "[subatom] Failed to load config from subatom.config.ts",
        expect.any(Error),
      );
    });
  });
});
