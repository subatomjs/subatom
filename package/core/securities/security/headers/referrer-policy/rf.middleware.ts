import { SECURITY_HEADERS } from "../../security.constants.js";
import { normalizeConfig } from "../../utils/normalizeConfig.js";
import { setHeader } from "../../utils/setHeader.js";
import {
	defaultReferrerPolicyConfig,
	type ReferrerPolicyConfig,
} from "./rf.config.js";

export function createReferrerPolicyMiddleware(
	options?: Partial<ReferrerPolicyConfig> | boolean,
) {
	const config = normalizeConfig(defaultReferrerPolicyConfig, options);
	if (!config) return (_req: any, _res: any, next: () => void) => next();

	const value = Array.isArray(config.policy)
		? config.policy.join(", ")
		: config.policy;

	return (_req: any, res: any, next: () => void) => {
		setHeader(res, SECURITY_HEADERS.REFERRER_POLICY, value || "no-referrer");
		next();
	};
}
