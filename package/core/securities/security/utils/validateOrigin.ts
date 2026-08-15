const VALID_ORIGIN_REGEX = /^([a-z0-9+-.]+:\/\/)?([^\s:/]+)(?::(\d+))?$/i;

export function isValidOrigin(origin: string): boolean {
	if (
		origin === "'self'" ||
		origin === "'none'" ||
		origin === "*" ||
		origin === "'unsafe-inline'" ||
		origin === "'unsafe-eval'"
	) {
		return true;
	}
	return VALID_ORIGIN_REGEX.test(origin);
}
