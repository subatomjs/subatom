export interface CSPDirectives {
	"default-src"?: string[];
	"script-src"?: string[];
	"style-src"?: string[];
	"img-src"?: string[];
	"connect-src"?: string[];
	"font-src"?: string[];
	"object-src"?: string[];
	"media-src"?: string[];
	"frame-src"?: string[];
	sandbox?: string[];
	"report-uri"?: string[];
	"child-src"?: string[];
	"form-action"?: string[];
	"frame-ancestors"?: string[];
	"plugin-types"?: string[];
	"base-uri"?: string[];
	"report-to"?: string[];
	"worker-src"?: string[];
	"manifest-src"?: string[];
	"upgrade-insecure-requests"?: boolean;
	"block-all-mixed-content"?: boolean;
	[key: string]: string[] | boolean | undefined;
}

export interface CSPConfig {
	directives?: CSPDirectives;
	reportOnly?: boolean;
}

export const defaultCSPConfig: CSPConfig = {
	directives: {
		"default-src": ["'self'"],
		"base-uri": ["'self'"],
		"font-src": ["'self'", "https:", "data:"],
		"form-action": ["'self'"],
		"frame-ancestors": ["'self'"],
		"img-src": ["'self'", "data:"],
		"object-src": ["'none'"],
		"script-src": ["'self'"],
		"script-src-attr": ["'none'"],
		"style-src": ["'self'", "https:", "'unsafe-inline'"],
		"upgrade-insecure-requests": true,
	},
	reportOnly: false,
};
