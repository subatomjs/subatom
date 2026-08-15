import { SECURITY_HEADERS } from "../../security.constants.js";
import { normalizeConfig } from "../../utils/normalizeConfig.js";
import { setHeader } from "../../utils/setHeader.js";
import {
	defaultFrameguardConfig,
	type FrameguardConfig,
} from "./frameguard.config.js";

export function createFrameguardMiddleware(
	options?: Partial<FrameguardConfig> | boolean,
) {
	const config = normalizeConfig(defaultFrameguardConfig, options);
	if (!config) return (_req: any, _res: any, next: () => void) => next();

	return (_req: any, res: any, next: () => void) => {
		setHeader(
			res,
			SECURITY_HEADERS.X_FRAME_OPTIONS,
			config.action || "SAMEORIGIN",
		);
		next();
	};
}
