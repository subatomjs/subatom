import type { IncomingMessage, ServerResponse } from "node:http";

export type CompressionAlgorithm = "br" | "gzip" | "deflate" | "identity";

export interface CompressionOptions {
	/**
	 * Compression algorithms ordered by server preference.
	 * Default: ["br", "gzip", "deflate"]
	 */
	algorithms?: CompressionAlgorithm[];

	/**
	 * Minimum response size in bytes required before compression is enabled.
	 * Default: 1024
	 */
	threshold?: number;

	/**
	 * MIME types eligible for compression.
	 */
	mimeTypes?: (string | RegExp)[];

	/**
	 * Compression levels.
	 */
	levels?: {
		br?: number;
		gzip?: number;
		deflate?: number;
	};

	/**
	 * Disable compression for responses containing sensitive headers.
	 * Defense-in-depth against BREACH-style attacks.
	 */
	enableBreachMitigation?: boolean;

	/**
	 * Headers that prevent compression.
	 */
	sensitiveHeaders?: string[];

	/**
	 * Application-level compression filter.
	 */
	shouldCompress?: (req: IncomingMessage, res: ServerResponse) => boolean;
}

export interface NegotiatedEncoding {
	algorithm: CompressionAlgorithm;
	qValue: number;
	acceptable: boolean;
}

export type CompressionState =
	| "pending"
	| "identity"
	| "compressing"
	| "rejected";

export interface StaticPrecompressOptions {
	/** Absolute path to the root directory hosting static files */
	publicDir: string;
	/** Custom mapping of algorithms to file extensions. Default: .br, .gz, .zst, .deflate */
	extensionMap?: Partial<Record<CompressionAlgorithm, string>>;
	/** Enable fallback to dynamic real-time compression if pre-compressed asset isn't found. Default: true */
	fallbackToDynamic?: boolean;
}
