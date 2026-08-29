/**
 * @fileoverview Pipeline function for safely chaining streams with automated cleanup.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { pipeline as nodePipeline, type Stream } from "node:stream";
import { promisify } from "node:util";

const pipelineAsync = promisify(nodePipeline) as (
	...streams: (
		| Stream
		| NodeJS.ReadableStream
		| NodeJS.WritableStream
		| NodeJS.ReadWriteStream
	)[]
) => Promise<void>;

export async function pipeline(
	...streams: (
		| Stream
		| NodeJS.ReadableStream
		| NodeJS.WritableStream
		| NodeJS.ReadWriteStream
	)[]
): Promise<void> {
	if (streams.length < 2) {
		throw new Error(
			"[Subatom Pipeline Error]: Pipeline requires at least 2 stream parameters.",
		);
	}
	await pipelineAsync(...streams);
}
