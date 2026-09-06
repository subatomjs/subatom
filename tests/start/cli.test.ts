import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const cliPath = path.resolve(process.cwd(), "start/cli.ts");
const tsxBin = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
const tempDir = path.resolve(process.cwd(), ".tmp_cli_test_fixture");

function runCli(
  args: string[],
  cwd: string = tempDir
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [tsxBin, cliPath, ...args],
      { cwd, env: { ...process.env, NODE_ENV: "test" } },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          code: error ? (error.code as number) ?? 1 : 0,
        });
      }
    );
  });
}

describe("cli.ts execution", () => {
  beforeEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Setup minimum viable Subatom workspace with entry file and package.json
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "cli-test", version: "1.0.0" })
    );
    fs.writeFileSync(path.join(tempDir, "index.js"), "console.log('ok');");
    fs.writeFileSync(
      path.join(tempDir, "subatom.config.js"),
      "export default { entry: 'index.js' };"
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should display version on -v / --version", async () => {
    const { stdout, code } = await runCli(["-v"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  it("should display help overview with all commands", async () => {
    const { stdout, code } = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("subatom [options] [command]");
    expect(stdout).toContain("dev");
    expect(stdout).toContain("build");
    expect(stdout).toContain("start");
    expect(stdout).toContain("preview");
  });

  it("should reject invalid port option for dev", async () => {
    const { stderr, code } = await runCli(["dev", "--port", "invalid"]);
    expect(code).toBe(1);
    expect(stderr).toContain("Invalid port");
  });

  it("should reject invalid port option for start", async () => {
    // Also build a dummy dist entry so start reaches the port validation logic
    const distDir = path.join(tempDir, "dist");
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, "index.js"), "console.log('built');");

    const { stderr, code } = await runCli(["start", "--port", "999999"]);
    expect(code).toBe(1);
    expect(stderr).toContain("Invalid port");
  });

  it("should fail gracefully when build has no source entry configured", async () => {
    const emptyDir = path.resolve(process.cwd(), ".tmp_empty_dir");
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.writeFileSync(
      path.join(emptyDir, "package.json"),
      JSON.stringify({ name: "empty-test", version: "1.0.0" })
    );

    const { stderr, code } = await runCli(["build"], emptyDir);
    expect(code).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);

    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("should fail preview if production build is missing", async () => {
    const { stderr, code } = await runCli(["preview"]);
    expect(code).toBe(1);
    expect(stderr).toContain("No production build found");
  });
});