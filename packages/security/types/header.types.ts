/**
 * @fileoverview Type provider of security header.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export interface ContentSecurityPolicyDirectives {
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

export interface ContentSecurityPolicyConfig {
	directives?: ContentSecurityPolicyDirectives;
	reportOnly?: boolean;
}

export type CrossOriginEmbedderPolicyValue =
	| "unsafe-none"
	| "require-corp"
	| "credentialless";

export interface CrossOriginEmbedderPolicyConfig {
	policy?: CrossOriginEmbedderPolicyValue;
}

export const defaultCrossOriginEmbedderPolicyConfig: CrossOriginEmbedderPolicyConfig =
	{
		policy: "require-corp",
	};

export type CrossOriginOpererPolicyValue =
	| "unsafe-none"
	| "same-origin-allow-popups"
	| "same-origin";

export interface CrossOriginOpererPolicyConfig {
	policy?: CrossOriginOpererPolicyValue;
}

export const defaultCrossOriginOpererPolicyConfig: CrossOriginOpererPolicyConfig =
	{
		policy: "same-origin",
	};

export type CrossOriginResourcePolicyValue =
	| "same-site"
	| "same-origin"
	| "cross-origin";

export interface CrossOriginResourcePolicyConfig {
	policy?: CrossOriginResourcePolicyValue;
}

export const defaultCrossOriginResourcePolicy: CrossOriginResourcePolicyConfig =
	{
		policy: "same-origin",
	};

export type FrameguardAction = "DENY" | "SAMEORIGIN";

export interface FrameguardConfig {
	action?: FrameguardAction;
}

export const defaultFrameguardConfig: FrameguardConfig = {
	action: "SAMEORIGIN",
};

export interface PermissionsPolicyDirectives {
	accelerometer?: string[];
	camera?: string[];
	geolocation?: string[];
	gyroscope?: string[];
	magnetometer?: string[];
	microphone?: string[];
	payment?: string[];
	usb?: string[];
	fullscreen?: string[];
	[key: string]: string[] | undefined;
}

export interface PermissionsPolicyConfig {
	features?: PermissionsPolicyDirectives;
}

export const defaultPermissionsPolicyConfig: PermissionsPolicyConfig = {
	features: {
		accelerometer: [],
		camera: [],
		geolocation: [],
		gyroscope: [],
		magnetometer: [],
		microphone: [],
		payment: [],
		usb: [],
	},
};

export type ReferrerPolicyValue =
	| "no-referrer"
	| "no-referrer-when-downgrade"
	| "origin"
	| "origin-when-cross-origin"
	| "same-origin"
	| "strict-origin"
	| "strict-origin-when-cross-origin"
	| "unsafe-url";

export interface ReferrerPolicyConfig {
	policy?: ReferrerPolicyValue | ReferrerPolicyValue[];
}

export const defaultReferrerPolicyConfig: ReferrerPolicyConfig = {
	policy: "no-referrer",
};

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
