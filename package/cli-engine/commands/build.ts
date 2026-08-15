// commands/build.ts
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { findAndLoadConfig } from "../../config/load.config.js";
import { logger } from "../utils/logger.js";
import { readUserPackageJson } from "../utils/pkg.js";

const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
]);
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

/**
 * Atomically replaces `outDir` with the contents of `tmpDir`.
 *
 * Naive "build in place" writes each output file independently, which
 * means any process that imports from `outDir` mid-build (e.g. a dev
 * server auto-restarting on file save) can observe a torn, half-updated
 * directory — some files rebuilt, some stale, some briefly missing. A
 * consumer resolving a class from that window can end up with a module
 * that's missing methods present in the source (see: intermittent
 * "getRoutes is not a function" when subatom's own dist was mid-rewrite).
 *
 * Instead we build into a scratch directory, then swap directories via
 * rename() — atomic on POSIX for paths on the same filesystem, and we
 * never delete the previous `outDir` until the new one is already fully
 * in place, so there is no window where `outDir` doesn't exist at all.
 */
function atomicReplaceDir(outDir: string, tmpDir: string): void {
	const hadPrevious = existsSync(outDir);
	const backupDir = `${outDir}.old-${process.pid}-${Date.now()}`;

	if (hadPrevious) {
		renameSync(outDir, backupDir);
	}

	try {
		renameSync(tmpDir, outDir);
	} catch (err) {
		// Roll back so we never leave the caller without a working outDir.
		if (hadPrevious) {
			renameSync(backupDir, outDir);
		}
		throw err;
	}

	if (hadPrevious) {
		rmSync(backupDir, { recursive: true, force: true });
	}
}

export async function runBuild(): Promise<void> {
	const cwd = process.cwd();
	const config = await findAndLoadConfig(cwd);
	const pkg = readUserPackageJson(cwd);

	const srcDir = path.resolve(
		cwd,
		path.dirname(config.entry).split(path.sep)[0] || "src",
	);
	const outDir = path.resolve(cwd, config.outDir);
	const tmpDir = `${outDir}.tmp-${process.pid}-${Date.now()}`;

	if (!existsSync(srcDir)) {
		logger.error(`Source directory not found: ${path.relative(cwd, srcDir)}`);
		process.exit(1);
	}

	const allFiles = walk(srcDir);
	const sourceFiles = allFiles.filter((f) =>
		SOURCE_EXTENSIONS.has(path.extname(f)),
	);
	const staticFiles = allFiles.filter((f) =>
		STATIC_ASSET_EXTENSIONS.has(path.extname(f)),
	);

	if (sourceFiles.length === 0) {
		logger.error(
			`No TypeScript/JavaScript source files found in ${path.relative(cwd, srcDir)}`,
		);
		process.exit(1);
	}

	const start = performance.now();
	logger.info(`Building ${sourceFiles.length} file(s)...`);

	// Build and stage everything in tmpDir first. Nothing under the real
	// outDir is touched until this entire block succeeds.
	mkdirSync(tmpDir, { recursive: true });

	try {
		await build({
			entryPoints: sourceFiles,
			outdir: tmpDir,
			outbase: srcDir,
			bundle: false,
			platform: "node",
			target: "node18",
			format: pkg.type === "module" ? "esm" : "cjs",
			sourcemap: config.sourcemap,
			minify: config.minify,
			logLevel: "silent",
		});

		for (const file of staticFiles) {
			const relative = path.relative(srcDir, file);
			const dest = path.join(tmpDir, relative);
			mkdirSync(path.dirname(dest), { recursive: true });
			copyFileSync(file, dest);
		}
	} catch (err) {
		rmSync(tmpDir, { recursive: true, force: true });
		logger.error("Build failed:");
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	}

	logger.info(`Swapping in new build...`);
	atomicReplaceDir(outDir, tmpDir);

	const elapsed = ((performance.now() - start) / 1000).toFixed(2);
	logger.success(
		`Build complete in ${elapsed}s → ${path.relative(cwd, outDir)}`,
	);
}
