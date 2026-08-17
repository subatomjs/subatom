/// <reference types="node" />

// tests/watch-engine/postbuild.test.ts

import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("postbuild binary patch script", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prepends shebang and updates permissions if binary exists without shebang", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("console.log('cli');");
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../../package/watch-engine/postbuild.ts");

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining("cli.js"),
      "#!/usr/bin/env node\nconsole.log('cli');",
      "utf8",
    );
    expect(chmodSpy).toHaveBeenCalledWith(
      expect.stringContaining("cli.js"),
      0o755,
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/CLI binary patched|Shebang added/i),
    );
  });

  it("does not duplicate shebang if it already exists", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("#!/usr/bin/env node\nconsole.log('cli');");
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../../package/watch-engine/postbuild.ts");

    if (writeSpy.mock.calls.length > 0) {
      expect(writeSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("#!/usr/bin/env node\n#!/usr/bin/env node"),
        expect.anything(),
      );
    }
    expect(chmodSpy).toHaveBeenCalled();
  });

  it("logs error and exits with code 1 when binary is not found", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(() => "");
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    await import("../../package/watch-engine/postbuild.ts");

    expect(readSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(chmodSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Postbuild failed: Binary not found"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});