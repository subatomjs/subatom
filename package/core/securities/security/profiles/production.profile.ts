import type { SecurityOptions } from "../security.config.js";

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
