import { SECURITY_HEADERS } from "../../security.constants.js";
import { normalizeConfig } from "../../utils/normalizeConfig.js";
import { setHeader } from "../../utils/setHeader.js";
import { defaultHSTSConfig, type HSTSConfig } from "./hsts.config.js";

export function createHSTSMiddleware(options?: Partial<HSTSConfig> | boolean) {
	const config = normalizeConfig(defaultHSTSConfig, options);
	if (!config) return (_req: any, _res: any, next: () => void) => next();

	let headerValue = `max-age=${config.maxAge}`;
	if (config.includeSubDomains) headerValue += "; includeSubDomains";
	if (config.preload) headerValue += "; preload";

	return (_req: any, res: any, next: () => void) => {
		setHeader(res, SECURITY_HEADERS.HSTS, headerValue);
		next();
	};
}
