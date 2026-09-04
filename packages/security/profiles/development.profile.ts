/**
 * @fileoverview Default development project profile configuration.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { SecurityOptions } from "../types/security.types.js";

export const developmentProfile: SecurityOptions = {
	csp: {
		directives: {
			"default-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
			"img-src": ["'self'", "data:", "blob:"],
		},
	},
	hsts: false,
	contentTypeOptions: true,
	frameguard: false,
	referrerPolicy: { policy: "no-referrer-when-downgrade" },
	coop: false,
	corp: false,
	coep: false,
	permissionsPolicy: false,
	dnsPrefetchControl: { allow: true },
	downloadOptions: true,
	originAgentCluster: false,
	xPoweredBy: "Subatom Dev Engine",
};
