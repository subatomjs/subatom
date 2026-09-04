/**
 * @fileoverview Default project profile configuration for production project.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { SecurityOptions } from "../types/security.types.js";

export const productionProfile: SecurityOptions = {
	csp: true,
	hsts: {
		maxAge: 31536000, // 1 year
		includeSubDomains: true,
		preload: true,
	},
	contentTypeOptions: true,
	frameguard: { action: "DENY" },
	referrerPolicy: { policy: "strict-origin-when-cross-origin" },
	coop: { policy: "same-origin" },
	corp: { policy: "same-origin" },
	coep: { policy: "require-corp" },
	permissionsPolicy: true,
	dnsPrefetchControl: { allow: false },
	downloadOptions: true,
	originAgentCluster: true,
	xPoweredBy: false,
};
