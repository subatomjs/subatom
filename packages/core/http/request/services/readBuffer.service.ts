/**
 * @fileoverview responsible for data reading in chunk.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import {
	BadRequestError,
	PayloadTooLargeError,
} from "../../../../errors/Errors.js";

export function readBuffer(
	rawStream: IncomingMessage,
	limitInBytes: number = 10 * 1024 * 1024,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let totalSize = 0;

		const onData = (chunk: Buffer) => {
			totalSize += chunk.length;
			if (totalSize > limitInBytes) {
				cleanup();
				reject(
					new PayloadTooLargeError(
						`Request payload exceeded the maximum allowed limit of ${limitInBytes} bytes`,
					),
				);
				return;
			}
			chunks.push(chunk);
		};

		const onEnd = () => {
			cleanup();
			resolve(Buffer.concat(chunks));
		};

		const onError = (err: Error) => {
			cleanup();
			reject(
				new BadRequestError(`Failed to read request stream: ${err.message}`),
			);
		};

		const cleanup = () => {
			rawStream.off("data", onData);
			rawStream.off("end", onEnd);
			rawStream.off("error", onError);
		};

		rawStream.on("data", onData);
		rawStream.on("end", onEnd);
		rawStream.on("error", onError);
	});
}
