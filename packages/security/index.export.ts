/**
 * @fileoverview Security policy export hub.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export {
	isProduction,
	normalizeSecurityConfig,
	setSecurityHeader,
	removeSecurityHeader,
	validateDirectiveName,
	isValidOrigin,
} from "./security.utils.js";
export { SECURITY_HEADERS } from "./security.constant.header.js";
export {
	defaultContentSecurityPConfig,
	VALID_CSP_DIRECTIVES,
	createContentSecurityPolicyMiddleware,
	serializeContentSecurityPolicy,
} from "./headers/contentSecurityPolicy.js";
export { createContentTypeOptionsMiddleware } from "./headers/contentTypeOptions.js";
export { createCrossOriginEmbedderPolicyMiddleware } from "./headers/crossOriginEmbedderPolicy.js";
export { createCOOPMiddleware } from "./headers/crossOriginOpenerPolicy.js";
export { createCORPMiddleware } from "./headers/crossOriginResourcePolicy.js";
export { createDNSPrefetchControlMiddleware } from "./headers/dnsPrefetchControl.js";
export { createDownloadOptionsMiddleware } from "./headers/downloadOptions.js";
export { createFrameguardMiddleware } from "./headers/frameguard.js";
export { createOriginAgentClusterMiddleware } from "./headers/originAgentCluster.js";
export {
	VALID_PERMISSIONS,
	createPermissionsPolicyMiddleware,
	serializePermissionsPolicy,
} from "./headers/permissionsPolicy.js";
export { createReferrerPolicyMiddleware } from "./headers/referrerPolicy.js";
export { createHSTSMiddleware } from "./headers/strictTransportSecurity.js";
export { createXPoweredByMiddleware } from "./headers/xPoweredBy.js";

// Profiles
export { defaultProfile } from "./profiles/default.profile.js";
export { developmentProfile } from "./profiles/development.profile.js";
export { enterpriseProfile } from "./profiles/enterprise.profile.js";
export { productionProfile } from "./profiles/production.profile.js";

export * from "./types/header.types.js";
export * from "./types/security.types.js";
