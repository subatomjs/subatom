/**
 * @fileoverview This module is responsible for MIME type resolution, mapping file paths and extensions
 *  to their standardized HTTP Content-Type media definitions.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import path from "node:path";

export const MIME_TYPES: Record<string, string> = {
	// --- Text & Web ---
	".html": "text/html; charset=utf-8",
	".htm": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".cjs": "text/javascript; charset=utf-8",
	".jsx": "text/javascript; charset=utf-8",
	".ts": "text/typescript; charset=utf-8",
	".tsx": "text/typescript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".jsonld": "application/ld+json",
	".map": "application/json; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".csv": "text/csv; charset=utf-8",
	".tsv": "text/tab-separated-values; charset=utf-8",
	".xml": "application/xml; charset=utf-8",
	".yaml": "text/yaml; charset=utf-8",
	".yml": "text/yaml; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".markdown": "text/markdown; charset=utf-8",

	// --- Images ---
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".pjp": "image/jpeg",
	".pjpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webp": "image/webp",
	".avif": "image/avif",
	".bmp": "image/bmp",
	".tiff": "image/tiff",
	".tif": "image/tiff",
	".heic": "image/heic",
	".heif": "image/heif",

	// --- Audio ---
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
	".oga": "audio/ogg",
	".m4a": "audio/mp4",
	".aac": "audio/aac",
	".flac": "audio/flac",
	".weba": "audio/webm",
	".opus": "audio/opus",
	".mid": "audio/midi",
	".midi": "audio/midi",

	// --- Video ---
	".mp4": "video/mp4",
	".m4v": "video/mp4",
	".webm": "video/webm",
	".ogv": "video/ogg",
	".avi": "video/x-msvideo",
	".mov": "video/quicktime",
	".wmv": "video/x-ms-wmv",
	".flv": "video/x-flv",
	".mkv": "video/x-matroska",
	".3gp": "video/3gpp",
	".3g2": "video/3gpp2",

	// --- Fonts ---
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".eot": "application/vnd.ms-fontobject",

	// --- Documents & Spreadsheets ---
	".pdf": "application/pdf",
	".rtf": "application/rtf",
	".doc": "application/msword",
	".docx":
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls": "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".ppt": "application/vnd.ms-powerpoint",
	".pptx":
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".odt": "application/vnd.oasis.opendocument.text",
	".ods": "application/vnd.oasis.opendocument.spreadsheet",
	".odp": "application/vnd.oasis.opendocument.presentation",

	// --- Archives & Compressed ---
	".zip": "application/zip",
	".rar": "application/vnd.rar",
	".7z": "application/x-7z-compressed",
	".tar": "application/x-tar",
	".gz": "application/gzip",
	".bz2": "application/x-bzip2",
	".xz": "application/x-xz",

	// --- WebAssembly & Binaries ---
	".wasm": "application/wasm",
	".exe": "application/vnd.microsoft.portable-executable",
	".dmg": "application/x-apple-diskimage",
	".iso": "application/x-iso9001-image",
	".apk": "application/vnd.android.package-archive",
	".jar": "application/java-archive",
};

export function getMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_TYPES[ext] || "application/octet-stream";
}
