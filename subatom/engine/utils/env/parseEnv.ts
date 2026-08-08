/**
 * Parses a raw .env file's contents into a key-value object.
 * Pure function — does not touch process.env or the filesystem.
 */

// Single-pass, dotenv-compatible line matcher.
// Supports: optional `export`, single/double/backtick-quoted values
// (including embedded newlines + escaped quotes), unquoted values,
// and trailing `#` comments on unquoted values.
const LINE =
	/(?:^|\n)\s*(?:export\s+)?([\w.-]+)\s*=\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"|`((?:\\`|[^`])*)`|([^\r\n#]*))/g;

export function parseEnv(src: string): Record<string, string> {
	const obj: Record<string, string> = {};
	const content = src.toString().replace(/\r\n?/g, "\n");

	let match: RegExpExecArray | null;
	LINE.lastIndex = 0;
	while ((match = LINE.exec(content)) !== null) {
		const key = match[1]!;
		let value: string;

		if (match[2] !== undefined) {
			value = match[2].replace(/\\'/g, "'");
		} else if (match[3] !== undefined) {
			value = match[3]
				.replace(/\\n/g, "\n")
				.replace(/\\r/g, "\r")
				.replace(/\\"/g, '"');
		} else if (match[4] !== undefined) {
			value = match[4].replace(/\\`/g, "`");
		} else {
			value = (match[5] ?? "").trim();
		}

		obj[key] = value;
	}

	return obj;
}
