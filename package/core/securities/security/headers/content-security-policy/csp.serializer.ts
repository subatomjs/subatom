import { validateDirectiveName } from "../../utils/validateDirective.js";
import type { CSPDirectives } from "./csp.config.js";

export function serializeCSP(directives: CSPDirectives): string {
	const result: string[] = [];

	for (const [key, val] of Object.entries(directives)) {
		validateDirectiveName(key);

		if (val === true) {
			result.push(key);
		} else if (Array.isArray(val) && val.length > 0) {
			result.push(`${key} ${val.join(" ")}`);
		}
	}

	return result.join("; ");
}
