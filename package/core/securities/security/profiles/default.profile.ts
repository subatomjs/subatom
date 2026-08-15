import type { SecurityOptions } from "../security.config.js";

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
