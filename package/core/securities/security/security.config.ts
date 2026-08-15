import type { CSPConfig } from "./headers/content-security-policy/csp.config.js";
import type { COEPConfig } from "./headers/cross-origin-embedder-policy/coep.config.js";
import type { COOPConfig } from "./headers/cross-origin-opener-policy/coop.config.js";
import type { CORPConfig } from "./headers/cross-origin-resource-policy/corp.config.js";
import type { FrameguardConfig } from "./headers/frameguard/frameguard.config.js";
import type { PermissionsPolicyConfig } from "./headers/permissions-policy/permissions-policy.config.js";
import type { ReferrerPolicyConfig } from "./headers/referrer-policy/index.js";
import type { HSTSConfig } from "./headers/strict-transport-security/hsts.config.js";

export interface SecurityOptions {
	csp?: Partial<CSPConfig> | boolean;
	hsts?: Partial<HSTSConfig> | boolean;
	contentTypeOptions?: boolean;
	frameguard?: Partial<FrameguardConfig> | boolean;
	referrerPolicy?: Partial<ReferrerPolicyConfig> | boolean;
	coop?: Partial<COOPConfig> | boolean;
	corp?: Partial<CORPConfig> | boolean;
	coep?: Partial<COEPConfig> | boolean;
	permissionsPolicy?: Partial<PermissionsPolicyConfig> | boolean;
	dnsPrefetchControl?: { allow?: boolean } | boolean;
	downloadOptions?: boolean;
	originAgentCluster?: boolean;
	xPoweredBy?: boolean | string;
}
