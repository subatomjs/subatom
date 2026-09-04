/**
 * @fileoverview Defines standardized HTTP security header names used across
 * Subatom’s security middleware and configuration.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export const SECURITY_HEADERS = {
	CSP: "Content-Security-Policy",
	CSP_REPORT_ONLY: "Content-Security-Policy-Report-Only",
	HSTS: "Strict-Transport-Security",
	X_CONTENT_TYPE_OPTIONS: "X-Content-Type-Options",
	X_FRAME_OPTIONS: "X-Frame-Options",
	REFERRER_POLICY: "Referrer-Policy",
	COOP: "Cross-Origin-Opener-Policy",
	CORP: "Cross-Origin-Resource-Policy",
	COEP: "Cross-Origin-Embedder-Policy",
	PERMISSIONS_POLICY: "Permissions-Policy",
	X_DNS_PREFETCH_CONTROL: "X-DNS-Prefetch-Control",
	X_DOWNLOAD_OPTIONS: "X-Download-Options",
	ORIGIN_AGENT_CLUSTER: "Origin-Agent-Cluster",
	X_POWERED_BY: "X-Powered-By",
} as const;
