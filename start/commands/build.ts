/**
 * @fileoverview The build.ts file will build the application.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
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
import { findAndLoadConfig } from "../../config/helpers/load.config.js";
import { logger, readUserPackageJson, resolveEntry } from "../utils/index.js";

const SOURCE_EXTENSIONS = new Set([
	".ts",
	".mts",
	".cts",
	".js",
	".mjs",
	".cjs",
]);

const STATIC_ASSET_EXTENSIONS = new Set([".txt", ".graphql"]);

/**
 * Directories that should never be traversed while collecting
 * project source files.
 */
const IGNORED_DIRECTORIES = new Set([
	"node_modules",
	".git",
	".next",
	".turbo",
	"dist",
	"build",
	"coverage",
	"tests",
	"test",
]);

/**
 * Specific filenames or patterns that should be completely ignored
 * to prevent copying configuration and metadata files into the build output.
 */
const IGNORED_FILES = new Set([
	"tsconfig.json",
	"jsconfig.json",
	"package.json",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	".env",
]);

/**
 * Checks if a filename matches config patterns like eslint.config.js, tsconfig.json, etc.,
 * while safely allowing source files and static assets.
 */
function isIgnoredFile(filename: string): boolean {
	const lower = filename.toLowerCase();
	if (IGNORED_FILES.has(lower)) {
		return true;
	}
	if (
		lower.startsWith("eslint") ||
		lower.startsWith("prettier") ||
		lower.includes("tsconfig") ||
		lower.includes("jsconfig") ||
		lower.includes("vitest")
	) {
		return true;
	}
	return false;
}

/**
 * Recursively walks a directory and returns all files inside it.
 */
function walk(dir: string, files: string[] = []): string[] {
	const entries = readdirSync(dir, {
		withFileTypes: true,
	});

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) {
				continue;
			}

			walk(fullPath, files);
			continue;
		}

		if (entry.isFile()) {
			if (isIgnoredFile(entry.name)) {
				continue;
			}
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * Replaces the existing output directory atomically.
 */
function atomicReplaceDir(outDir: string, tmpDir: string): void {
	const hadPrevious = existsSync(outDir);
	const backupDir = `${outDir}.old-${process.pid}-${Date.now()}`;

	if (hadPrevious) {
		renameSync(outDir, backupDir);
	}

	try {
		renameSync(tmpDir, outDir);
	} catch (err: unknown) {
		if (hadPrevious && !existsSync(outDir) && existsSync(backupDir)) {
			renameSync(backupDir, outDir);
		}

		throw err;
	}

	if (hadPrevious && existsSync(backupDir)) {
		rmSync(backupDir, {
			recursive: true,
			force: true,
		});
	}
}

/**
 * Logs a list of files relative to the project root.
 */
function logFiles(files: readonly string[], cwd: string, prefix = "✓"): void {
	for (const file of files) {
		console.log(`  ${prefix} ${path.relative(cwd, file)}`);
	}
}

/**
 * Checks whether a file has a supported source extension.
 */
function isSourceFile(file: string): boolean {
	return SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/**
 * Copies static assets while preserving their directory structure.
 */
function copyStaticFiles(
	files: readonly string[],
	srcDir: string,
	tmpDir: string,
): void {
	for (const file of files) {
		const relative = path.relative(srcDir, file);
		const destination = path.join(tmpDir, relative);

		mkdirSync(path.dirname(destination), {
			recursive: true,
		});

		copyFileSync(file, destination);
	}
}

/**
 * Builds the current Subatom application.
 */
export async function runBuild(): Promise<void> {
	const cwd = process.cwd();

	const config = await findAndLoadConfig(cwd);
	const pkg = readUserPackageJson(cwd);

	let entryFile: string;

	try {
		entryFile = path.resolve(cwd, resolveEntry(config.entry, cwd));
	} catch (err: unknown) {
		logger.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}

	if (!existsSync(entryFile)) {
		logger.error(`Entry file not found: ${path.relative(cwd, entryFile)}`);
		process.exit(1);
	}

	const entryStat = statSync(entryFile);

	if (!entryStat.isFile()) {
		logger.error(`Entry path is not a file: ${path.relative(cwd, entryFile)}`);
		process.exit(1);
	}

	if (!isSourceFile(entryFile)) {
		logger.error(
			`Unsupported entry file type: ${path.relative(cwd, entryFile)}`,
		);
		logger.error(`Supported extensions: ${[...SOURCE_EXTENSIONS].join(", ")}`);
		process.exit(1);
	}

	const srcDir = path.dirname(entryFile);

	const outDir = path.resolve(cwd, config.outDir ?? "dist");

	const tmpDir = `${outDir}.tmp-${process.pid}-${Date.now()}`;

	if (!existsSync(srcDir)) {
		logger.error(`Source directory not found: ${path.relative(cwd, srcDir)}`);
		process.exit(1);
	}

	if (!statSync(srcDir).isDirectory()) {
		logger.error(
			`Source path is not a directory: ${path.relative(cwd, srcDir)}`,
		);
		process.exit(1);
	}

	const allFiles = walk(srcDir);

	const sourceFiles = allFiles.filter(isSourceFile);
	const staticFiles = allFiles.filter((file) => {
		const ext = path.extname(file).toLowerCase();
		const basename = path.basename(file).toLowerCase();
		return STATIC_ASSET_EXTENSIONS.has(ext) || basename === ".env";
	});

	if (!sourceFiles.includes(entryFile)) {
		sourceFiles.push(entryFile);
	}

	const uniqueSourceFiles = [...new Set(sourceFiles)];

	const start = performance.now();

	logger.info(
		`Building ${uniqueSourceFiles.length} source file${
			uniqueSourceFiles.length === 1 ? "" : "s"
		}...`,
	);

	logger.info(`Entry: ${path.relative(cwd, entryFile)}`);

	logFiles(uniqueSourceFiles, cwd);

	if (staticFiles.length > 0) {
		logger.info(
			`Copying ${staticFiles.length} asset${
				staticFiles.length === 1 ? "" : "s"
			}...`,
		);

		logFiles(staticFiles, cwd);
	}

	if (existsSync(tmpDir)) {
		rmSync(tmpDir, {
			recursive: true,
			force: true,
		});
	}

	mkdirSync(tmpDir, {
		recursive: true,
	});

	try {
		await build({
			entryPoints: uniqueSourceFiles,
			outdir: tmpDir,
			outbase: srcDir,
			bundle: false,
			platform: "node",
			target: "node18",
			format: pkg.type === "module" ? "esm" : "cjs",
			sourcemap: config.sourcemap ?? true,
			minify: config.minify ?? false,
			logLevel: "silent",
		});

		if (staticFiles.length > 0) {
			copyStaticFiles(staticFiles, srcDir, tmpDir);
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

	try {
		logger.info("Swapping in new build...");
		atomicReplaceDir(outDir, tmpDir);
	} catch (err: unknown) {
		rmSync(tmpDir, {
			recursive: true,
			force: true,
		});

		logger.error("Failed to replace production build:");

		console.error(err instanceof Error ? err.message : err);

		process.exit(1);
	}

	const elapsed = ((performance.now() - start) / 1000).toFixed(2);

	logger.success(
		`Compiled ${uniqueSourceFiles.length} source file${
			uniqueSourceFiles.length === 1 ? "" : "s"
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
