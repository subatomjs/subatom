/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * This module is responsible for serving pre-compressed static assets directly from disk
 * (e.g., .gz, .br, .zst, .deflate),
 * bypassing CPU-intensive runtime compression when matching files already exist.
 */

import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type {
	CompressionAlgorithm,
	StaticPrecompressOptions,
} from "./types/compression.types.js";
import { Compression } from "./Compression.js";
import { getStaticMimeType } from "./utils.js";

const DEFAULT_EXT_MAP: Record<string, string> = {
	br: ".br",
	gzip: ".gz",
	zstd: ".zst",
	deflate: ".deflate",
};

export class StaticPreCompress {
	private publicDir: string;
	private extMap: Record<string, string>;
	private fallbackToDynamic: boolean;
	private compressionEngine: Compression;

	constructor(options: StaticPrecompressOptions) {
		this.publicDir = path.resolve(options.publicDir);
		this.extMap = { ...DEFAULT_EXT_MAP, ...options.extensionMap };
		this.fallbackToDynamic = options.fallbackToDynamic ?? true;
		this.compressionEngine = new Compression();
	}

	public resolvePrecompressedFile(
		req: IncomingMessage,
		requestPath: string,
	): { targetPath: string; encoding: CompressionAlgorithm | null } {
		const rawAcceptEncoding = req.headers["accept-encoding"] as
			| string
			| undefined;
		const { algorithm } = this.compressionEngine.negotiate(rawAcceptEncoding);

		if (algorithm === "identity") {
			return { targetPath: requestPath, encoding: null };
		}

		const extension = this.extMap[algorithm];
		if (extension) {
			const precompressedPath = `${requestPath}${extension}`;
			if (fs.existsSync(precompressedPath)) {
				return { targetPath: precompressedPath, encoding: algorithm };
			}
		}

		const priorityFallbacks: CompressionAlgorithm[] = ["br", "gzip", "deflate"];
		for (const fallbackAlgo of priorityFallbacks) {
			if (fallbackAlgo === algorithm) continue;
			const ext = this.extMap[fallbackAlgo];
			if (ext) {
				const fallbackPath = `${requestPath}${ext}`;
				if (fs.existsSync(fallbackPath)) {
					return { targetPath: fallbackPath, encoding: fallbackAlgo };
				}
			}
		}

		return { targetPath: requestPath, encoding: null };
	}

	private async resolvePrecompressedFileAsync(
		req: IncomingMessage,
		requestPath: string,
	): Promise<{ targetPath: string; encoding: CompressionAlgorithm | null }> {
		const rawAcceptEncoding = req.headers["accept-encoding"] as
			| string
			| undefined;
		const { algorithm } = this.compressionEngine.negotiate(rawAcceptEncoding);

		if (algorithm === "identity") {
			return { targetPath: requestPath, encoding: null };
		}

		const candidates: Array<{
			path: string;
			encoding: CompressionAlgorithm;
		}> = [];
		const preferredExtension = this.extMap[algorithm];
		if (preferredExtension) {
			candidates.push({
				path: `${requestPath}${preferredExtension}`,
				encoding: algorithm,
			});
		}

		for (const fallbackAlgo of ["br", "gzip", "deflate"] as const) {
			if (fallbackAlgo === algorithm) continue;
			const extension = this.extMap[fallbackAlgo];
			if (extension) {
				candidates.push({
					path: `${requestPath}${extension}`,
					encoding: fallbackAlgo,
				});
			}
		}

		for (const candidate of candidates) {
			try {
				const stat = await fs.promises.stat(candidate.path);
				if (stat.isFile()) {
					return { targetPath: candidate.path, encoding: candidate.encoding };
				}
			} catch {
				// Try the next available encoding.
			}
		}

		return { targetPath: requestPath, encoding: null };
	}

	public middleware() {
		return async (
			req: IncomingMessage,
			res: ServerResponse,
			next: () => void,
		) => {
			if (req.method !== "GET" && req.method !== "HEAD") {
				return next();
			}

			const safeRelativePath = path
				.normalize(req.url || "/")
				.replace(/^(\.\.[/\\])+/, "");
			const absoluteFilePath = path.join(this.publicDir, safeRelativePath);

			let sourceStat: fs.Stats;
			try {
				sourceStat = await fs.promises.stat(absoluteFilePath);
			} catch {
				return next();
			}
			if (!sourceStat.isFile()) return next();

			const existingVary = res.getHeader("Vary");
			if (!existingVary) {
				res.setHeader("Vary", "Accept-Encoding");
			} else if (
				typeof existingVary === "string" &&
				!existingVary.includes("Accept-Encoding")
			) {
				res.setHeader("Vary", `${existingVary}, Accept-Encoding`);
			}

			const { targetPath, encoding } = await this.resolvePrecompressedFileAsync(
				req,
				absoluteFilePath,
			);

			if (encoding) {
				res.setHeader("Content-Encoding", encoding);

				const mimeType = getStaticMimeType(absoluteFilePath);
				if (mimeType) res.setHeader("Content-Type", mimeType);

				const stat = await fs.promises.stat(targetPath);
				res.setHeader("Content-Length", stat.size);

				if (req.method === "HEAD") {
					res.statusCode = 200;
					return res.end();
				}

				const readStream = fs.createReadStream(targetPath);
				readStream.pipe(res);
				return;
			}

			next();
		};
	}
}
