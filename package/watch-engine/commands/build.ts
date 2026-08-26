/**
 * @fileoverview The build.ts file will bundle the app.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Kunal Chandra Das
 * @license MIT
 */


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
import { readUserPackageJson } from "../utils/pkg.js";
import { logger } from "../utils/logger.js";
// import { findAndLoadConfig } from "../../config/helpers/load.config.js";
// import { logger, readUserPackageJson } from "../utils/index.js";

const SOURCE_EXTENSIONS = new Set([
	".ts",
	".mts",
	".cts",
	".js",
	".mjs",
	".cjs",
]);

const STATIC_ASSET_EXTENSIONS = new Set([
	".json",
	".env",
	".txt",
	".graphql",
]);

function walk(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const fullPath = path.join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			if (entry === "node_modules" || entry.startsWith(".")) {
				continue;
			}

			walk(fullPath, files);
		} else {
			files.push(fullPath);
		}
	}

	return files;
}

function atomicReplaceDir(outDir: string, tmpDir: string): void {
	const hadPrevious = existsSync(outDir);
	const backupDir = `${outDir}.old-${process.pid}-${Date.now()}`;

	if (hadPrevious) {
		renameSync(outDir, backupDir);
	}

	try {
		renameSync(tmpDir, outDir);
	} catch (err: unknown) {
		if (hadPrevious) {
			renameSync(backupDir, outDir);
		}

		throw err;
	}

	if (hadPrevious) {
		rmSync(backupDir, {
			recursive: true,
			force: true,
		});
	}
}

function logFiles(
	files: readonly string[],
	cwd: string,
	prefix = "✓",
): void {
	for (const file of files) {
		console.log(`  ${prefix} ${path.relative(cwd, file)}`);
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
		logger.error(
			`Source directory not found: ${path.relative(cwd, srcDir)}`,
		);
		process.exit(1);
	}

	const allFiles = walk(srcDir);

	const sourceFiles = allFiles.filter((file) =>
		SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()),
	);

	const staticFiles = allFiles.filter((file) =>
		STATIC_ASSET_EXTENSIONS.has(path.extname(file).toLowerCase()),
	);

	if (sourceFiles.length === 0) {
		logger.error(
			`No TypeScript/JavaScript source files found in ${path.relative(
				cwd,
				srcDir,
			)}`,
		);
		process.exit(1);
	}

	const start = performance.now();

	logger.info(
		`Building ${sourceFiles.length} source file${
			sourceFiles.length === 1 ? "" : "s"
		}...`,
	);

	logFiles(sourceFiles, cwd);

	if (staticFiles.length > 0) {
		logger.info(
			`Copying ${staticFiles.length} asset${
				staticFiles.length === 1 ? "" : "s"
			}...`,
		);

		logFiles(staticFiles, cwd);
	}

	mkdirSync(tmpDir, {
		recursive: true,
	});

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

			mkdirSync(path.dirname(dest), {
				recursive: true,
			});

			copyFileSync(file, dest);
		}
	} catch (err: unknown) {
		rmSync(tmpDir, {
			recursive: true,
			force: true,
		});

		logger.error("Build failed:");

		console.error(err instanceof Error ? err.message : err);

		process.exit(1);
	}

	logger.info("Swapping in new build...");

	atomicReplaceDir(outDir, tmpDir);

	const elapsed = ((performance.now() - start) / 1000).toFixed(2);

	logger.success(
		`Compiled ${sourceFiles.length} source file${
			sourceFiles.length === 1 ? "" : "s"
		} successfully.`,
	);

	if (staticFiles.length > 0) {
		logger.success(
			`Copied ${staticFiles.length} asset${
				staticFiles.length === 1 ? "" : "s"
			} successfully.`,
		);
	}

	logger.success(
		`Build complete in ${elapsed}s → ${path.relative(cwd, outDir)}`,
	);
}