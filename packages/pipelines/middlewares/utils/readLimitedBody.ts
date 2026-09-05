import type { IncomingMessage } from "node:http";
import {
	BadRequestError,
	PayloadTooLargeError,
} from "../../../errors/Errors.js";

export async function readLimitedBody(
	request: IncomingMessage,
	maxBytes: number,
): Promise<Buffer> {
	const rawContentLength = request.headers["content-length"];
	if (rawContentLength !== undefined) {
		if (
			typeof rawContentLength !== "string" ||
			!/^[0-9]+$/.test(rawContentLength)
		) {
			request.resume();
			throw new BadRequestError("Invalid Content-Length");
		}

		const contentLength = Number(rawContentLength);
		if (!Number.isSafeInteger(contentLength)) {
			request.resume();
			throw new BadRequestError("Invalid Content-Length");
		}
		if (contentLength > maxBytes) {
			request.resume();
			throw new PayloadTooLargeError("Payload Too Large");
		}
	}

	const chunks: Buffer[] = [];
	let totalBytes = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		totalBytes += buffer.length;
		if (totalBytes > maxBytes) {
			request.resume();
			throw new PayloadTooLargeError("Payload Too Large");
		}
		chunks.push(buffer);
	}

	return Buffer.concat(chunks, totalBytes);
}

export function isPayloadTooLarge(error: unknown): boolean {
	return error instanceof PayloadTooLargeError;
}
