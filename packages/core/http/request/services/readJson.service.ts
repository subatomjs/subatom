/**
 * @fileoverview responsible to read json values.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import { BadRequestError } from "../../../../errors/Errors.js";
import { readText } from "./readText.service.js";

export async function readJson<T>(
	rawStream: IncomingMessage,
	limitInBytes?: number,
): Promise<T> {
	const textBody = await readText(rawStream, limitInBytes);
	if (!textBody.trim()) {
		return {} as T;
	}

	try {
		return JSON.parse(textBody) as T;
	} catch (jsonErr: unknown) {
		throw new BadRequestError("Invalid JSON payload provided in request body", {
			rawError: (jsonErr as Error).message,
		});
	}
}
