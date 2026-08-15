import type { SecurityOptions } from "../security.config.js";

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
