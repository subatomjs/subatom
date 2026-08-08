import { SubatomError } from "../../http/errors/Error.js";

export function normalizeError(err: unknown): Error {
	if (err instanceof Error) {
		return err;
	}
	if (typeof err === "string") {
		return new SubatomError(err);
	}
	return new SubatomError(
		"A non-Error value was thrown during request handling.",
		{ details: err },
	);
}
