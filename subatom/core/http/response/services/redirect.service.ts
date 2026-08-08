import { SubatomError } from "../../errors/Error.js";
import { assertNoHeaderInjection } from "./setHeader.service.js";

export function redirect(
	url: string,
	statusCode: number,
	setStatusAndRedirect: (code: number, location: string) => void,
): void {
	if (statusCode < 300 || statusCode > 399) {
		throw new SubatomError(
			`Invalid redirect status code: ${statusCode}. Must be a 3xx status.`,
			{ statusCode: 500, errorCode: "INVALID_REDIRECT_STATUS" },
		);
	}
	assertNoHeaderInjection("Location", url);
	setStatusAndRedirect(statusCode, url);
}
