import { validateDirectiveName } from "../../utils/validateDirective.js";
import type { PermissionsPolicyDirectives } from "./permissions-policy.config.js";

export function serializePermissionsPolicy(
	features: PermissionsPolicyDirectives,
): string {
	const parts: string[] = [];

	for (const [feature, allowList] of Object.entries(features)) {
		validateDirectiveName(feature);
		if (!allowList) continue;

		if (allowList.length === 0) {
			parts.push(`${feature}=()`);
		} else {
			const formatted = allowList
				.map((item) => (item === "self" || item === "*" ? item : `"${item}"`))
				.join(" ");
			parts.push(`${feature}=(${formatted})`);
		}
	}

	return parts.join(", ");
}
