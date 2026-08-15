import type { IncomingMessage, ServerResponse } from "node:http";
import type { Transform } from "node:stream";
import zlib from "node:zlib";
import type {
	CompressionAlgorithm,
	CompressionOptions,
	NegotiatedEncoding,
} from "../../../types/http/ICompression.js";
import { negotiateEncoding } from "./negotiate.js";
import {
	clampInteger,
	DEFAULT_MIME_TYPES,
	getHeaderString,
	isBodylessResponse,
	normalizeMimeType,
} from "./utils.js";

export class SubatomCompression {
	public readonly opts: {
		algorithms: CompressionAlgorithm[];
		threshold: number;
		mimeTypes: (string | RegExp)[];
		levels: {
			br: number;
			gzip: number;
			deflate: number;
		};
		enableBreachMitigation: boolean;
		sensitiveHeaders: string[];
		shouldCompress?: CompressionOptions["shouldCompress"];
	};

	constructor(options: CompressionOptions = {}) {
		this.opts = {
			algorithms: [...(options.algorithms ?? ["br", "gzip", "deflate"])],

			threshold: Math.max(
				0,
				Number.isFinite(options.threshold ?? 1024)
					? (options.threshold ?? 1024)
					: 1024,
			),

			mimeTypes: options.mimeTypes ?? DEFAULT_MIME_TYPES,

			levels: {
				br: clampInteger(options.levels?.br ?? 4, 0, 11, 4),

				gzip: clampInteger(
					options.levels?.gzip ?? zlib.constants.Z_DEFAULT_COMPRESSION,
					-1,
					9,
					zlib.constants.Z_DEFAULT_COMPRESSION,
				),

				deflate: clampInteger(
					options.levels?.deflate ?? zlib.constants.Z_DEFAULT_COMPRESSION,
					-1,
					9,
					zlib.constants.Z_DEFAULT_COMPRESSION,
				),
			},

			enableBreachMitigation: options.enableBreachMitigation ?? true,

			sensitiveHeaders: (
				options.sensitiveHeaders ?? ["set-cookie", "x-csrf-token"]
			).map((header) => header.trim().toLowerCase()),

			shouldCompress: options.shouldCompress,
		};
	}

	public negotiate(
		acceptEncodingHeader: string | undefined,
	): NegotiatedEncoding {
		return negotiateEncoding(acceptEncodingHeader, this.opts.algorithms);
	}

	public isCompressible(
		req: IncomingMessage,
		res: ServerResponse,
		knownLength?: number,
	): boolean {
		if (this.opts.shouldCompress && !this.opts.shouldCompress(req, res)) {
			return false;
		}

		if (res.getHeader("content-encoding") !== undefined) {
			return false;
		}

		if (isBodylessResponse(req, res)) {
			return false;
		}

		if (this.opts.enableBreachMitigation) {
			for (const headerName of this.opts.sensitiveHeaders) {
				if (res.getHeader(headerName) !== undefined) {
					return false;
				}
			}
		}

		const contentType = getHeaderString(res, "content-type");

		if (!contentType) {
			return false;
		}

		const pureType = normalizeMimeType(contentType);

		if (!pureType) {
			return false;
		}

		const matches = this.opts.mimeTypes.some((pattern) => {
			if (typeof pattern === "string") {
				return pattern.trim().toLowerCase() === pureType;
			}

			pattern.lastIndex = 0;

			return pattern.test(pureType);
		});

		if (!matches) {
			return false;
		}

		const contentLength = res.getHeader("content-length");

		if (contentLength !== undefined) {
			const length =
				typeof contentLength === "number"
					? contentLength
					: Number(contentLength);

			if (!Number.isFinite(length) || length < 0) {
				return false;
			}

			return length >= this.opts.threshold;
		}

		if (knownLength !== undefined) {
			return knownLength >= this.opts.threshold;
		}

		return true;
	}

	public createCompressorStream(
		algorithm: CompressionAlgorithm,
	): Transform | null {
		try {
			switch (algorithm) {
				case "br":
					return zlib.createBrotliCompress({
						params: {
							[zlib.constants.BROTLI_PARAM_QUALITY]: this.opts.levels.br,
						},
					});

				case "gzip":
					return zlib.createGzip({
						level: this.opts.levels.gzip,
					});

				case "deflate":
					return zlib.createDeflate({
						level: this.opts.levels.deflate,
					});

				case "identity":
				default:
					return null;
			}
		} catch {
			return null;
		}
	}
}
