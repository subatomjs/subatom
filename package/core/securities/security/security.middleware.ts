import { createCSPMiddleware } from "./headers/content-security-policy/csp.middleware.js";
import { createContentTypeOptionsMiddleware } from "./headers/content-type-options/index.js";
import { createCOEPMiddleware } from "./headers/cross-origin-embedder-policy/coep.middleware.js";
import { createCOOPMiddleware } from "./headers/cross-origin-opener-policy/coop.middleware.js";
import { createCORPMiddleware } from "./headers/cross-origin-resource-policy/corp.middleware.js";
import { createDNSPrefetchControlMiddleware } from "./headers/dns-prefetch-control/index.js";
import { createDownloadOptionsMiddleware } from "./headers/download-options/index.js";
import { createFrameguardMiddleware } from "./headers/frameguard/frameguard.middleware.js";
import { createOriginAgentClusterMiddleware } from "./headers/origin-agent-cluster/index.js";
import { createPermissionsPolicyMiddleware } from "./headers/permissions-policy/permissions-policy.middleware.js";
import { createReferrerPolicyMiddleware } from "./headers/referrer-policy/index.js";
import { createHSTSMiddleware } from "./headers/strict-transport-security/hsts.middleware.js";
import { createXPoweredByMiddleware } from "./headers/x-powered-by/index.js";
import { defaultProfile } from "./profiles/default.profile.js";
import type { SecurityOptions } from "./security.config.js";
import { mergeConfig } from "./utils/mergeConfig.js";

export function subatomSecurity(options?: SecurityOptions) {
	const mergedConfig = mergeConfig(defaultProfile, options);

	const middlewares: Array<(_req: any, res: any, next: () => void) => void> =
		[];

	if (mergedConfig.csp !== false)
		middlewares.push(createCSPMiddleware(mergedConfig.csp));
	if (mergedConfig.hsts !== false)
		middlewares.push(createHSTSMiddleware(mergedConfig.hsts));
	if (mergedConfig.contentTypeOptions !== false)
		middlewares.push(
			createContentTypeOptionsMiddleware(mergedConfig.contentTypeOptions),
		);
	if (mergedConfig.frameguard !== false)
		middlewares.push(createFrameguardMiddleware(mergedConfig.frameguard));
	if (mergedConfig.referrerPolicy !== false)
		middlewares.push(
			createReferrerPolicyMiddleware(mergedConfig.referrerPolicy),
		);
	if (mergedConfig.coop !== false)
		middlewares.push(createCOOPMiddleware(mergedConfig.coop));
	if (mergedConfig.corp !== false)
		middlewares.push(createCORPMiddleware(mergedConfig.corp));
	if (mergedConfig.coep !== false)
		middlewares.push(createCOEPMiddleware(mergedConfig.coep));
	if (mergedConfig.permissionsPolicy !== false)
		middlewares.push(
			createPermissionsPolicyMiddleware(mergedConfig.permissionsPolicy),
		);
	if (mergedConfig.dnsPrefetchControl !== false)
		middlewares.push(
			createDNSPrefetchControlMiddleware(mergedConfig.dnsPrefetchControl),
		);
	if (mergedConfig.downloadOptions !== false)
		middlewares.push(
			createDownloadOptionsMiddleware(mergedConfig.downloadOptions),
		);
	if (mergedConfig.originAgentCluster !== false)
		middlewares.push(
			createOriginAgentClusterMiddleware(mergedConfig.originAgentCluster),
		);

	middlewares.push(createXPoweredByMiddleware(mergedConfig.xPoweredBy));

	return function securityMiddleware(req: any, res: any, next: () => void) {
		let index = 0;

		function runNext() {
			if (index < middlewares.length) {
				const mw = middlewares[index++]!;
				mw(req, res, runNext);
			} else {
				next();
			}
		}

		runNext();
	};
}
