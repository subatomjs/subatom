/**
 * @fileoverview Responsible for http operation and status code providing.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

const RAW_STATUSES = [
	// 1xx
	{ code: 100, message: "continue", isError: false },
	{ code: 101, message: "switching_protocols", isError: false },
	{ code: 102, message: "processing", isError: false },
	{ code: 103, message: "early_hints", isError: false },

	// 2xx
	{ code: 200, message: "success", isError: false },
	{ code: 201, message: "created", isError: false },
	{ code: 202, message: "accepted", isError: false },
	{ code: 203, message: "non_authoritative_information", isError: false },
	{ code: 204, message: "no_content", isError: false },
	{ code: 205, message: "reset_content", isError: false },
	{ code: 206, message: "partial_content", isError: false },
	{ code: 207, message: "multi_status", isError: false },
	{ code: 208, message: "already_reported", isError: false },
	{ code: 226, message: "im_used", isError: false },

	// 3xx
	{ code: 300, message: "multiple_choices", isError: false },
	{ code: 301, message: "moved_permanently", isError: false },
	{ code: 302, message: "found", isError: false },
	{ code: 303, message: "see_other", isError: false },
	{ code: 304, message: "not_modified", isError: false },
	{ code: 305, message: "use_proxy", isError: false },
	{ code: 307, message: "temporary_redirect", isError: false },
	{ code: 308, message: "permanent_redirect", isError: false },

	// 4xx
	{ code: 400, message: "bad_request", isError: true },
	{ code: 401, message: "unauthorized", isError: true },
	{ code: 402, message: "payment_required", isError: true },
	{ code: 403, message: "forbidden", isError: true },
	{ code: 404, message: "not_found", isError: true },
	{ code: 405, message: "method_not_allowed", isError: true },
	{ code: 406, message: "not_acceptable", isError: true },
	{ code: 407, message: "proxy_authentication_required", isError: true },
	{ code: 408, message: "request_timeout", isError: true },
	{ code: 409, message: "conflict", isError: true },
	{ code: 410, message: "gone", isError: true },
	{ code: 411, message: "length_required", isError: true },
	{ code: 412, message: "precondition_failed", isError: true },
	{ code: 413, message: "content_too_large", isError: true },
	{ code: 414, message: "uri_too_long", isError: true },
	{ code: 415, message: "unsupported_media_type", isError: true },
	{ code: 416, message: "range_not_satisfiable", isError: true },
	{ code: 417, message: "expectation_failed", isError: true },
	{ code: 418, message: "im_a_teapot", isError: true },
	{ code: 421, message: "misdirected_request", isError: true },
	{ code: 422, message: "unprocessable_content", isError: true },
	{ code: 423, message: "locked", isError: true },
	{ code: 424, message: "failed_dependency", isError: true },
	{ code: 425, message: "too_early", isError: true },
	{ code: 426, message: "upgrade_required", isError: true },
	{ code: 428, message: "precondition_required", isError: true },
	{ code: 429, message: "too_many_requests", isError: true },
	{ code: 431, message: "request_header_fields_too_large", isError: true },
	{ code: 451, message: "unavailable_for_legal_reasons", isError: true },

	// 5xx
	{ code: 500, message: "internal_server_error", isError: true },
	{ code: 501, message: "not_implemented", isError: true },
	{ code: 502, message: "bad_gateway", isError: true },
	{ code: 503, message: "service_unavailable", isError: true },
	{ code: 504, message: "gateway_timeout", isError: true },
	{ code: 505, message: "http_version_not_supported", isError: true },
	{ code: 506, message: "variant_also_negotiates", isError: true },
	{ code: 507, message: "insufficient_storage", isError: true },
	{ code: 508, message: "loop_detected", isError: true },
	{ code: 510, message: "not_extended", isError: true },
	{ code: 511, message: "network_authentication_required", isError: true },
] as const;

// Human-readable fallback message, computed once — "internal_server_error" -> "Internal Server Error"
function toTitleCase(snake: string): string {
	return snake
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

export type IHttpStatusEntry = {
	code: number;
	message: (typeof RAW_STATUSES)[number]["message"];
	isError: boolean;
	defaultMessage: string;
};

export const HTTP_STATUS_REGISTRY: ReadonlyMap<string, IHttpStatusEntry> =
	new Map(
		RAW_STATUSES.map((entry) => [
			entry.message,
			{ ...entry, defaultMessage: toTitleCase(entry.message) },
		]),
	);

type StatusEntry = (typeof RAW_STATUSES)[number];
export type TSuccessHelperName = Extract<
	StatusEntry,
	{ isError: false }
>["message"];
export type TErrorHelperName = Extract<
	StatusEntry,
	{ isError: true }
>["message"];
