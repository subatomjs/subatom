/**
 * @fileoverview Type provider of Security policy
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ContentSecurityPolicyConfig,
	CrossOriginEmbedderPolicyConfig,
	CrossOriginOpererPolicyConfig,
	FrameguardConfig,
	HSTSConfig,
	PermissionsPolicyConfig,
	ReferrerPolicyConfig,
} from "./header.types.js";

export interface SecurityOptions {
	csp?: Partial<ContentSecurityPolicyConfig> | boolean;
	hsts?: Partial<HSTSConfig> | boolean;
	contentTypeOptions?: boolean;
	frameguard?: Partial<FrameguardConfig> | boolean;
	referrerPolicy?: Partial<ReferrerPolicyConfig> | boolean;
	coop?: Partial<CrossOriginOpererPolicyConfig> | boolean;
	corp?: Partial<CrossOriginOpererPolicyConfig> | boolean;
	coep?: Partial<CrossOriginEmbedderPolicyConfig> | boolean;
	permissionsPolicy?: Partial<PermissionsPolicyConfig> | boolean;
	dnsPrefetchControl?: { allow?: boolean } | boolean;
	downloadOptions?: boolean;
	originAgentCluster?: boolean;
	xPoweredBy?: boolean | string;
}
