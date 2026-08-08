import type { IncomingMessage } from "node:http";
import { readBuffer } from "./readBuffer.service.js";

export async function readText(
	rawStream: IncomingMessage,
	limitInBytes?: number,
): Promise<string> {
	const buf = await readBuffer(rawStream, limitInBytes);
	return buf.toString("utf-8");
}
