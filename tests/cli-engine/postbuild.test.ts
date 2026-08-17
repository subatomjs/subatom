import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("postbuild binary patch script", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it("prepends shebang and updates permissions if binary exists without shebang", async () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        vi.spyOn(fs, "readFileSync").mockReturnValue("console.log('cli');");
        const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
        const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation(() => {});
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        await import( "../../package/cli-engine/postbuild.ts");

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
            expect.stringContaining("CLI binary patched"),
        );
    });
});