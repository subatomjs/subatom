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
		let settled = false;
		const chunks: Buffer[] = [];
		let totalSize = 0;

		const cleanup = () => {
			rawStream.off("data", onData);
			rawStream.off("end", onEnd);
			rawStream.off("error", onError);
			rawStream.off("aborted", onAborted);
			rawStream.off("close", onClose);
		};
		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};

		const onData = (chunk: Buffer) => {
			if (settled) return;
			totalSize += chunk.length;
			if (totalSize > limitInBytes) {
				fail(
					new PayloadTooLargeError(
						`Request payload exceeded the maximum allowed limit of ${limitInBytes} bytes`,
					),
				);
				return;
			}
			chunks.push(chunk);
		};

		const onEnd = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(Buffer.concat(chunks));
		};

		const onError = (err: Error) => {
			fail(
				new BadRequestError(`Failed to read request stream: ${err.message}`),
			);
		};

		const onAborted = () => fail(new BadRequestError("Request aborted"));
		const onClose = () => {
			if (!settled) fail(new BadRequestError("Request stream closed early"));
		};

		rawStream.on("data", onData);
		rawStream.on("end", onEnd);
		rawStream.on("error", onError);
		rawStream.once("aborted", onAborted);
		rawStream.once("close", onClose);
	});
}
