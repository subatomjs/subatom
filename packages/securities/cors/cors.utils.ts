import type { CorsOrigin } from "./types/cors.types.js";

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;
type CorsOriginFnWithCallback = (
	origin: string | undefined,
	callback: CorsOriginCallback,
) => void;

export function normalizeHeaderValue(val?: string | string[]): string {
	if (Array.isArray(val)) {
		return val
			.map((item) => item.trim())
			.filter(Boolean)
			.join(",");
	}
	return val ? val.trim() : "";
}

export function isOriginAllowed(
	origin: string,
	allowedOrigin: string | RegExp,
): boolean {
	if (typeof allowedOrigin === "string") {
		return origin === allowedOrigin;
	}
	if (allowedOrigin instanceof RegExp) {
		return allowedOrigin.test(origin);
	}
	return false;
}

export async function resolveOrigin(
	requestOrigin: string | undefined,
	originConfig: CorsOrigin | undefined,
): Promise<string | boolean> {
	if (!requestOrigin || originConfig === undefined || originConfig === "*") {
		return originConfig === "*" ? "*" : false;
	}

	if (typeof originConfig === "boolean") {
		return originConfig;
	}

	if (typeof originConfig === "string") {
		return isOriginAllowed(requestOrigin, originConfig) ? requestOrigin : false;
	}

	if (originConfig instanceof RegExp) {
		return isOriginAllowed(requestOrigin, originConfig) ? requestOrigin : false;
	}

	if (Array.isArray(originConfig)) {
		const isMatch = originConfig.some((allowed) =>
			isOriginAllowed(requestOrigin, allowed),
		);
		return isMatch ? requestOrigin : false;
	}

	if (typeof originConfig === "function") {
		if (originConfig.length <= 1) {
			const result = await (
				originConfig as (origin?: string) => Promise<boolean> | boolean
			)(requestOrigin);
			return result ? requestOrigin : false;
		}

		return new Promise<string | boolean>((resolve) => {
			(originConfig as CorsOriginFnWithCallback)(
				requestOrigin,
				(err: Error | null, allow?: boolean) => {
					if (err || !allow) {
						resolve(false);
					} else {
						resolve(requestOrigin);
					}
				},
			);
		});
	}

	return false;
}
