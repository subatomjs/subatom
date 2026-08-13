import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import type { RequestOptions } from "../../../../types/http/IRequest.js";

export function resolveOrigin(
	rawStream: IncomingMessage,
	headers: Record<string, string | string[] | undefined>,
	options: RequestOptions,
	trustProxy: boolean,
): { protocol: string; host: string } {
	const defaultHost =
		options.defaultHost || process.env.SUBATOM_DEFAULT_HOST || "localhost";

	const firstValue = (
		headerVal: string | string[] | undefined,
	): string | undefined => {
		const raw = Array.isArray(headerVal) ? headerVal[0] : headerVal;
		return raw?.split(",")[0]?.trim() || undefined;
	};

	const isEncrypted =
		(rawStream.socket as TLSSocket | undefined)?.encrypted === true;

	let protocol = isEncrypted ? "https" : "http";
	if (trustProxy) {
		const forwardedProto = firstValue(headers["x-forwarded-proto"]);
		if (forwardedProto) protocol = forwardedProto;
	}

	let host = firstValue(headers["host"]) || defaultHost;
	if (trustProxy) {
		const forwardedHost = firstValue(headers["x-forwarded-host"]);
		if (forwardedHost) host = forwardedHost;
	}

	return { protocol, host };
}
