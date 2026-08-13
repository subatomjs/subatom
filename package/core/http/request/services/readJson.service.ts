import type { IncomingMessage } from "node:http";
import { BadRequestError } from "../../errors/Error.js";
import { readText } from "./readText.service.js";

export async function readJson<T>(
	rawStream: IncomingMessage,
	limitInBytes?: number,
): Promise<T> {
	const textBody = await readText(rawStream, limitInBytes);
	if (!textBody || !textBody.trim()) {
		return {} as T;
	}

	try {
		return JSON.parse(textBody) as T;
	} catch (jsonErr: any) {
		throw new BadRequestError("Invalid JSON payload provided in request body", {
			rawError: jsonErr.message,
		});
	}
}
