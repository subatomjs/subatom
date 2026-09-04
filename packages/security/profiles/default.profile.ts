/**
 * @fileoverview Default project profile configuration.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { SecurityOptions } from "../types/security.types.js";

export const defaultProfile: SecurityOptions = {
	csp: true,
	hsts: true,
	contentTypeOptions: true,
	frameguard: { action: "SAMEORIGIN" },
	referrerPolicy: { policy: "no-referrer" },
	coop: { policy: "same-origin" },
	corp: { policy: "same-origin" },
	coep: false,
	permissionsPolicy: true,
	dnsPrefetchControl: { allow: false },
	downloadOptions: true,
	originAgentCluster: true,
	xPoweredBy: false,
};
