/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * Parses a raw .env file's contents into a key-value object.
 *
 * Pure function — does not touch process.env or the filesystem.
 */

// Single-pass, dotenv-compatible line matcher.
//
// Supports:
// - optional `export`
// - single/double/backtick-quoted values
// - escaped quotes
// - embedded newlines in quoted values
// - unquoted values
// - trailing `#` comments on unquoted values
const LINE =
	/(?:^|\n)[\t ]*(?:export[\t ]+)?([\w.-]+)[\t ]*=[\t ]*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"|`((?:\\`|[^`])*)`|([^\r\n#]*))/g;

export function parseEnv(src: string): Record<string, string> {
	const obj: Record<string, string> = {};

	const content = src.toString().replace(/\r\n?/g, "\n");

	let match: RegExpExecArray | null;

	// biome-ignore lint/suspicious/noAssignInExpressions: explanation
	while ((match = LINE.exec(content)) !== null) {
		// biome-ignore lint/style/noNonNullAssertion: explanation
		const key = match[1]!;

		let value: string;

		if (match[2] !== undefined) {
			// Single-quoted value
			value = match[2].replace(/\\'/g, "'");
		} else if (match[3] !== undefined) {
			// Double-quoted value
			value = match[3]
				.replace(/\\n/g, "\n")
				.replace(/\\r/g, "\r")
				.replace(/\\"/g, '"');
		} else if (match[4] !== undefined) {
			// Backtick-quoted value
			value = match[4].replace(/\\`/g, "`");
		} else {
			// Unquoted value
			value = match[5]!.trim();
		}

		obj[key] = value;
	}

	LINE.lastIndex = 0;

	return obj;
}
