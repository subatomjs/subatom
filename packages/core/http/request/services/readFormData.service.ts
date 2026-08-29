/**
 * @fileoverview responsible to read data from form.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import { readText } from "./readText.service.js";

export async function readFormData(
	rawStream: IncomingMessage,
	limitInBytes?: number,
): Promise<URLSearchParams> {
	const textBody = await readText(rawStream, limitInBytes);
	return new URLSearchParams(textBody);
}
