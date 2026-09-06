import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";

describe("postbuild script", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("should fail and exit 1 if cli binary does not exist", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    await import("../../start/postbuild.js");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Postbuild failed"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should inject shebang and apply chmod permissions", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("console.log('test');");
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation(() => {});

    await import("../../start/postbuild.js");

    expect(writeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/^#!/),
      "utf8"
    );
    expect(chmodSpy).toHaveBeenCalledWith(expect.any(String), 0o755);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("CLI binary patched"));
  });

  it("should catch and warn if chmod throws", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("#!/usr/bin/env node\nconsole.log(1);");
    vi.spyOn(fs, "chmodSync").mockImplementation(() => {
      throw new Error("EPERM not permitted");
    });

    await import("../../start/postbuild.js");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not apply chmod"),
      "EPERM not permitted"
    );
  });
});