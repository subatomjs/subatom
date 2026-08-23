// subatom/package/core/docs/handlerInspector.ts

/**
 * Canonical shape a file-upload middleware factory (file.single / file.array /
 * file.fields) must attach to the handler function it returns, via
 * `handler._fileConfig = {...}`.
 *
 * IMPORTANT: This is the *only* supported detection mechanism. The previous
 * implementation fell back to `handler.toString().includes("single")`, which
 * is unsafe in production for two reasons:
 *   1. Any unrelated middleware whose source text happens to contain the
 *      substring "single"/"array"/"fields" (e.g. a variable named
 *      `isSingleUse`) would be misdetected as a file handler.
 *   2. Minified/bundled production builds frequently do not preserve
 *      readable function source at all, so `.toString()` can return
 *      "[native code]" or mangled output, silently breaking detection.
 *
 * If `file.ts` does not yet attach `_fileConfig` to the handlers it returns,
 * that is the actual root fix needed — see the TODO below and share that
 * file so this can be wired precisely instead of guessed at.
 */
export interface FileMetadata {
	type: "single" | "array" | "fields";
	/** Multipart field name. Required for "single" and "array". */
	fieldname?: string;
	maxCount?: number;
	fields?: Array<{ name: string; maxCount?: number }>;
}

/**
 * `Function` and an arbitrary object type don't structurally overlap enough
 * for TS to allow a direct cast between them (that's the TS2352 error this
 * type exists to avoid) — a bare function's call signature isn't compatible
 * with an object literal's property signature, even though at runtime a
 * function is just an object that happens to be callable. This interface
 * says explicitly "a callable value that may also carry `_fileConfig`",
 * which TS can check against `Function` without complaint.
 */
interface FunctionWithFileConfig extends Function {
	_fileConfig?: unknown;
}

/**
 * Checks if a middleware is a file upload handler and extracts its metadata.
 *
 * Detection order:
 *   1. `handler._fileConfig` — the canonical, explicit contract. This is the
 *      only mechanism that can recover the actual fieldname the developer
 *      passed (e.g. "avatar" in `file.single("avatar", {...})`).
 *   2. Nothing else. String-sniffing was removed — an undetected file
 *      handler produces a route with no multipart body in the docs, which
 *      is a visible, fixable gap. A *misdetected* one silently ships wrong
 *      docs to every consumer of the generated spec, which is worse.
 *
 * TODO(subatom-infer / file.ts integration): confirm that `file.single()`,
 * `file.array()`, and `file.fields()` in file.ts actually set
 * `handler._fileConfig` with the real fieldname/maxCount the caller passed.
 * If they don't yet, that's a one-line fix there rather than a workaround
 * here — happy to wire it once that file is shared.
 */
export function extractFileMetadata(handler: unknown): FileMetadata | null {
	if (typeof handler !== "function") {
		return null;
	}

	// `typeof handler === "function"` only narrows `unknown` down to the
	// built-in `Function` type, which has no `_fileConfig` property — so this
	// still needs an explicit assertion to the richer interface above. That's
	// expected and safe *because* everything past this point re-validates
	// `_fileConfig`'s actual shape at runtime rather than trusting the type.
	const candidate = handler as FunctionWithFileConfig;
	if (!candidate._fileConfig) {
		return null;
	}

	const config = candidate._fileConfig as FileMetadata;

	// Defensive validation — a malformed _fileConfig should not silently
	// produce a broken/misleading OpenAPI schema.
	if (
		config &&
		(config.type === "single" ||
			config.type === "array" ||
			config.type === "fields")
	) {
		return config;
	}

	console.warn(
		"[subatom:docs] Handler has a _fileConfig property but it does not " +
			'match the expected shape ({ type: "single"|"array"|"fields", ... }). ' +
			"Ignoring it for OpenAPI generation. Handler:",
		candidate.name || "anonymous",
	);

	return null;
}