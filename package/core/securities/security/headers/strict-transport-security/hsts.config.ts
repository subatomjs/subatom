export interface HSTSConfig {
	maxAge?: number;
	includeSubDomains?: boolean;
	preload?: boolean;
}

export const defaultHSTSConfig: HSTSConfig = {
	maxAge: 15552000, // 180 days in seconds
	includeSubDomains: true,
	preload: false,
};
