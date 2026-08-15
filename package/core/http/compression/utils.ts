import type { IncomingMessage, ServerResponse } from "node:http";

export const DEFAULT_MIME_TYPES: (string | RegExp)[] = [
	/^text\/.+$/i,
	/^application\/json$/i,
	/^application\/javascript$/i,
	/^application\/xml$/i,
	/^application\/wasm$/i,
	/^image\/svg\+xml$/i,
];

export const NO_BODY_STATUS_CODES = new Set<number>([204, 304]);

/**
 * Convert a value into a safe byte length.
 */
export function getChunkByteLength(
	chunk: unknown,
	encoding?: BufferEncoding,
): number | undefined {
	if (chunk === undefined) {
		return 0;
	}

	if (typeof chunk === "string") {
		return Buffer.byteLength(chunk, encoding);
	}

	if (Buffer.isBuffer(chunk)) {
		return chunk.byteLength;
	}

	if (chunk instanceof Uint8Array) {
		return chunk.byteLength;
	}

	return undefined;
}

export function clampInteger(
	value: number,
	min: number,
	max: number,
	fallback: number,
): number {
	if (!Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Parse an HTTP q-value.
 */
export function parseQValue(value: string): number | null {
	const normalized = value.trim();

	if (!normalized) {
		return null;
	}

	const parsed = Number(normalized);

	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
		return null;
	}

	const decimalIndex = normalized.indexOf(".");

	if (decimalIndex !== -1) {
		const decimalPlaces = normalized.length - decimalIndex - 1;

		if (decimalPlaces > 3) {
			return null;
		}
	}

	return parsed;
}

export function normalizeMimeType(value: string): string {
	return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function getHeaderString(
	res: ServerResponse,
	name: string,
): string | undefined {
	const value = res.getHeader(name);

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number") {
		return String(value);
	}

	if (Array.isArray(value)) {
		return value.map(String).join(", ");
	}

	return undefined;
}

export function isBodylessResponse(
	req: IncomingMessage,
	res: ServerResponse,
): boolean {
	if (req.method?.toUpperCase() === "HEAD") {
		return true;
	}

	const status = res.statusCode;

	if (status >= 100 && status < 200) {
		return true;
	}

	return NO_BODY_STATUS_CODES.has(status);
}

/**
 * Adds Accept-Encoding to Vary without creating duplicates.
 */
export function addVaryAcceptEncoding(res: ServerResponse): void {
	const existing = res.getHeader("Vary");

	if (existing === undefined) {
		res.setHeader("Vary", "Accept-Encoding");
		return;
	}

	if (existing === "*") {
		return;
	}

	const values: string[] = Array.isArray(existing)
		? existing.flatMap((value) =>
				String(value)
					.split(",")
					.map((item) => item.trim())
					.filter(Boolean),
			)
		: String(existing)
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);

	const exists = values.some(
		(value) => value.toLowerCase() === "accept-encoding",
	);

	if (!exists) {
		values.push("Accept-Encoding");
	}

	res.setHeader("Vary", values.join(", "));
}

export function getStaticMimeType(filePath: string): string {
	const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
	const map: Record<string, string> = {
		".html": "text/html; charset=utf-8",
		".css": "text/css; charset=utf-8",
		".js": "application/javascript; charset=utf-8",
		".json": "application/json; charset=utf-8",
		".svg": "image/svg+xml",
		".wasm": "application/wasm",
	};
	return map[ext] || "application/octet-stream";
}
