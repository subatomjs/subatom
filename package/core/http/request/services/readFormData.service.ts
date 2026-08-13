import type { IncomingMessage } from "node:http";
import { readText } from "./readText.service.js";

export async function readFormData(
	rawStream: IncomingMessage,
	limitInBytes?: number,
): Promise<URLSearchParams> {
	const textBody = await readText(rawStream, limitInBytes);
	return new URLSearchParams(textBody);
}
