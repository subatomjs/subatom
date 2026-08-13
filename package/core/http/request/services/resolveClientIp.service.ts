import type { IncomingMessage } from "node:http";
import { getHeader } from "./getHeader.service.js";

export function resolveClientIp(
	rawStream: IncomingMessage,
	headers: Record<string, string | string[] | undefined>,
	trustProxy: boolean,
): string {
	if (trustProxy) {
		const forwardedFor = getHeader(headers, "x-forwarded-for");
		if (forwardedFor) {
			const first = forwardedFor.split(",")[0] ?? "";
			return first.trim();
		}
	}
	return rawStream.socket.remoteAddress || "";
}
