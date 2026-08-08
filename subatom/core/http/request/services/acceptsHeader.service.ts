import { getHeader } from "./getHeader.service.js";

export function acceptsHeader(
	headers: Record<string, string | string[] | undefined>,
	contentType: string,
): boolean {
	const acceptHeader = getHeader(headers, "accept");
	if (!acceptHeader) return false;

	const acceptedTypes = acceptHeader.split(",").map((type) => type.trim());
	return acceptedTypes.includes(contentType);
}
