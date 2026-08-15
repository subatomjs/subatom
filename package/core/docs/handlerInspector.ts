// subatom/package/core/docs/handlerInspector.ts

export interface FileMetadata {
	type: "single" | "array" | "fields";
	fieldname?: string;
	maxCount?: number;
	fields?: Array<{ name: string; maxCount?: number }>;
}

/**
 * Checks if a middleware is a file upload handler and extracts metadata.
 */
export function extractFileMetadata(handler: any): FileMetadata | null {
	// Check custom property attached to file middleware or inspect function flags
	if (handler._fileConfig) {
		return handler._fileConfig;
	}

	// Fallback string matching if subatom's file helper attaches name signatures
	const fnStr = handler.toString();
	if (fnStr.includes("single")) {
		return { type: "single" };
	}
	if (fnStr.includes("array")) {
		return { type: "array" };
	}
	if (fnStr.includes("fields")) {
		return { type: "fields" };
	}

	return null;
}
