// src/rate-limit/keys.ts
import type { KeyResolver } from "./rateLimit.config.js";

export async function resolveKey(
	req: any,
	resolver: KeyResolver,
): Promise<string> {
	if (typeof resolver === "function") {
		return String(await resolver(req));
	}

	switch (resolver) {
		case "ip":
			// Respect Subatom trusted proxy / ip resolution
			return req.ip || req.socket?.remoteAddress || "0.0.0.0";
		case "user":
			return req.user?.id ? `user:${req.user.id}` : resolveKey(req, "ip");
		case "api-key": {
			const apiKey = req.headers["x-api-key"] || req.headers["authorization"];
			return apiKey
				? `apikey:${hashSecret(String(apiKey))}`
				: resolveKey(req, "ip");
		}
		case "tenant":
			return req.tenant?.id ? `tenant:${req.tenant.id}` : resolveKey(req, "ip");
		case "route":
			return `route:${req.baseUrl || ""}${req.path || req.url}`;
		case "composite": {
			const ip = req.ip || req.socket?.remoteAddress || "0.0.0.0";
			const path = req.path || req.url;
			return `${ip}:${path}`;
		}
		default:
			return resolveKey(req, "ip");
	}
}

// Never expose raw keys/secrets directly in storage or logging
function hashSecret(val: string): string {
	let hash = 0;
	for (let i = 0; i < val.length; i++) {
		hash = (hash << 5) - hash + val.charCodeAt(i);
		hash |= 0;
	}
	return hash.toString(36);
}
