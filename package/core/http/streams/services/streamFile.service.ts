import { createReadStream } from "node:fs";
import { stat as statAsync } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
	RangeNotSatisfiableError,
	type RangeSpec,
	type StreamPipeOptions,
} from "../../../../types/http/IStream.js";
import { pipeToResponse } from "./pipeline.service.js";

export interface StreamFileOptions extends StreamPipeOptions {
	contentType?: string;
	/**
	 * Enables byte-range requests (206 Partial Content) - required for
	 * video/audio scrubbing and resumable downloads. Default true.
	 */
	acceptRanges?: boolean;
	/** Extra headers (e.g. ETag, Last-Modified, Cache-Control). */
	headers?: Record<string, string>;
}

/**
 * Parses a `Range: bytes=...` header against a known resource size.
 * Supports the three forms the spec allows: `start-end`, `start-`
 * (open-ended), and `-suffixLength` (last N bytes). Multi-range requests
 * (`bytes=0-99,200-299`) are intentionally not supported - the response
 * would need `multipart/byteranges`, which is rarely needed in practice;
 * we fall back to serving the first range only... actually we reject
 * outright so the caller doesn't silently get an incomplete resource.
 */
export function parseRange(
	rangeHeader: string | undefined,
	size: number,
): RangeSpec | null {
	if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
	const spec = rangeHeader.slice("bytes=".length);
	if (spec.includes(",")) {
		// Multi-range: not supported, treat as unsatisfiable rather than guess.
		throw new RangeNotSatisfiableError(size);
	}

	const [startStr = "", endStr = ""] = spec.split("-");
	let start: number;
	let end: number;

	if (startStr === "") {
		// Suffix range: "bytes=-500" -> last 500 bytes.
		const suffixLength = parseInt(endStr, 10);
		if (Number.isNaN(suffixLength) || suffixLength <= 0) {
			throw new RangeNotSatisfiableError(size);
		}
		start = Math.max(size - suffixLength, 0);
		end = size - 1;
	} else {
		start = parseInt(startStr, 10);
		end = endStr === "" ? size - 1 : parseInt(endStr, 10);
	}

	if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0) {
		throw new RangeNotSatisfiableError(size);
	}
	end = Math.min(end, size - 1);

	return { start, end };
}

/**
 * Streams a file to the response, transparently handling conditional
 * range requests. On a satisfiable `Range` header, responds 206 with
 * `Content-Range`; otherwise streams the full file with `Content-Length`.
 * An unsatisfiable range gets a spec-compliant 416 with
 * `Content-Range: bytes *\/<size>`.
 */
export async function streamFileToResponse(
	req: IncomingMessage,
	raw: ServerResponse,
	filePath: string,
	options: StreamFileOptions = {},
): Promise<void> {
	const { acceptRanges = true, contentType, headers, ...pipeOptions } = options;
	const fileStat = await statAsync(filePath);

	if (headers) {
		for (const [key, value] of Object.entries(headers))
			raw.setHeader(key, value);
	}
	if (contentType) raw.setHeader("Content-Type", contentType);
	if (acceptRanges) raw.setHeader("Accept-Ranges", "bytes");

	const rangeHeader = req.headers["range"] as string | undefined;
	let range: RangeSpec | null = null;

	if (acceptRanges && rangeHeader) {
		try {
			range = parseRange(rangeHeader, fileStat.size);
		} catch (err) {
			if (err instanceof RangeNotSatisfiableError) {
				raw.setHeader("Content-Range", `bytes */${fileStat.size}`);
				raw.statusCode = 416;
				raw.end();
				return;
			}
			throw err;
		}
	}

	if (range) {
		raw.statusCode = 206;
		raw.setHeader(
			"Content-Range",
			`bytes ${range.start}-${range.end}/${fileStat.size}`,
		);
		raw.setHeader("Content-Length", range.end - range.start + 1);
		await pipeToResponse(
			raw,
			createReadStream(filePath, { start: range.start, end: range.end }),
			pipeOptions,
		);
		return;
	}

	raw.statusCode =
		raw.statusCode && raw.statusCode !== 200 ? raw.statusCode : 200;
	raw.setHeader("Content-Length", fileStat.size);
	await pipeToResponse(raw, createReadStream(filePath), pipeOptions);
}
