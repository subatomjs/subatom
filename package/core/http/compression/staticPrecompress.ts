import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type {
	CompressionAlgorithm,
	StaticPrecompressOptions,
} from "../../../types/http/ICompression.js";
import { SubatomCompression } from "./compressor.js";
import { getStaticMimeType } from "./utils.js";

const DEFAULT_EXT_MAP: Record<string, string> = {
	br: ".br",
	gzip: ".gz",
	zstd: ".zst",
	deflate: ".deflate",
};

export class SubatomStaticPrecompress {
	private publicDir: string;
	private extMap: Record<string, string>;
	private fallbackToDynamic: boolean;
	private compressionEngine: SubatomCompression;

	constructor(options: StaticPrecompressOptions) {
		this.publicDir = path.resolve(options.publicDir);
		this.extMap = { ...DEFAULT_EXT_MAP, ...options.extensionMap };
		this.fallbackToDynamic = options.fallbackToDynamic ?? true;
		this.compressionEngine = new SubatomCompression();
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

	public middleware() {
		return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
			if (req.method !== "GET" && req.method !== "HEAD") {
				return next();
			}

			const safeRelativePath = path
				.normalize(req.url || "/")
				.replace(/^(\.\.[/\\])+/, "");
			const absoluteFilePath = path.join(this.publicDir, safeRelativePath);

			if (
				!fs.existsSync(absoluteFilePath) ||
				fs.statSync(absoluteFilePath).isDirectory()
			) {
				return next();
			}

			const existingVary = res.getHeader("Vary");
			if (!existingVary) {
				res.setHeader("Vary", "Accept-Encoding");
			} else if (
				typeof existingVary === "string" &&
				!existingVary.includes("Accept-Encoding")
			) {
				res.setHeader("Vary", `${existingVary}, Accept-Encoding`);
			}

			const { targetPath, encoding } = this.resolvePrecompressedFile(
				req,
				absoluteFilePath,
			);

			if (encoding) {
				res.setHeader("Content-Encoding", encoding);

				const mimeType = getStaticMimeType(absoluteFilePath);
				if (mimeType) res.setHeader("Content-Type", mimeType);

				const stat = fs.statSync(targetPath);
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
