import type { SecurityOptions } from "../security.config.js";

export const enterpriseProfile: SecurityOptions = {
	csp: {
		directives: {
			"default-src": ["'none'"],
			"script-src": ["'self'"],
			"style-src": ["'self'"],
			"img-src": ["'self'"],
			"connect-src": ["'self'"],
			"font-src": ["'self'"],
			"frame-ancestors": ["'none'"],
			"form-action": ["'self'"],
			"base-uri": ["'none'"],
			"upgrade-insecure-requests": true,
			"block-all-mixed-content": true,
		},
		reportOnly: false,
	},
	hsts: {
		maxAge: 63072000, // 2 years
		includeSubDomains: true,
		preload: true,
	},
	contentTypeOptions: true,
	frameguard: { action: "DENY" },
	referrerPolicy: { policy: "no-referrer" },
	coop: { policy: "same-origin" },
	corp: { policy: "same-origin" },
	coep: { policy: "require-corp" },
	permissionsPolicy: {
		features: {
			accelerometer: [],
			camera: [],
			geolocation: [],
			gyroscope: [],
			magnetometer: [],
			microphone: [],
			payment: [],
			usb: [],
			fullscreen: ["self"],
		},
	},
	dnsPrefetchControl: { allow: false },
	downloadOptions: true,
	originAgentCluster: true,
	xPoweredBy: false,
};
