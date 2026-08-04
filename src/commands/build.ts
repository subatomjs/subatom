import { build } from "esbuild";
import { rmSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { readUserPackageJson } from "../utils/pkg.js";
import { logger } from "../utils/logger.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const STATIC_ASSET_EXTENSIONS = new Set([".json", ".env", ".txt", ".graphql"]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

export async function runBuild(): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const pkg = readUserPackageJson(cwd);

  const srcDir = path.resolve(cwd, path.dirname(config.entry).split(path.sep)[0] || "src");
  const outDir = path.resolve(cwd, config.outDir);

  if (!existsSync(srcDir)) {
    logger.error(`Source directory not found: ${path.relative(cwd, srcDir)}`);
    process.exit(1);
  }

  logger.info(`Cleaning ${path.relative(cwd, outDir)}...`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const allFiles = walk(srcDir);
  const sourceFiles = allFiles.filter((f) => SOURCE_EXTENSIONS.has(path.extname(f)));
  const staticFiles = allFiles.filter((f) => STATIC_ASSET_EXTENSIONS.has(path.extname(f)));

  if (sourceFiles.length === 0) {
    logger.error(`No TypeScript/JavaScript source files found in ${path.relative(cwd, srcDir)}`);
    process.exit(1);
  }

  const start = performance.now();
  logger.info(`Building ${sourceFiles.length} file(s)...`);

  try {
    await build({
      entryPoints: sourceFiles,
      outdir: outDir,
      outbase: srcDir,
      bundle: false,
      platform: "node",
      target: "node18",
      format: pkg.type === "module" ? "esm" : "cjs",
      sourcemap: config.sourcemap,
      minify: config.minify,
      logLevel: "silent",
    });
  } catch (err) {
    logger.error("Build failed:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  for (const file of staticFiles) {
    const relative = path.relative(srcDir, file);
    const dest = path.join(outDir, relative);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(file, dest);
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  logger.success(`Build complete in ${elapsed}s → ${path.relative(cwd, outDir)}`);
}