import { existsSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { basename, extname } from "node:path";
import type { DownloadOptions } from "../../../../types/http/IResponse.js";
import { MIME_TYPES } from "../../../utils/mime.js";
import { pipeFile, resolveSafePath } from "./sendFile.service.js";
import { setAttachment } from "./setAttachment.service.js";
import { setHeader } from "./setHeader.service.js";

export function downloadFile(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	filePath: string,
	filename?: string,
	options: DownloadOptions = {},
	setStatusCode: (code: number) => void = () => {},
): void {
	const resolvedPath = resolveSafePath(filePath, options.root);
	if (resolvedPath === null) {
		setStatusCode(403);
		raw.end("Forbidden");
		return;
	}
	if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
		setStatusCode(404);
		raw.end("File not found");
		return;
	}

	const resolvedFilename =
		filename || options.filename || basename(resolvedPath);
	setAttachment(raw, headersMap, headersSent, resolvedFilename);

	const ext = extname(resolvedPath).toLowerCase();
	const mimeType =
		options.contentType || MIME_TYPES[ext] || "application/octet-stream";

	setHeader(raw, headersMap, headersSent, "Content-Type", mimeType);
	setHeader(
		raw,
		headersMap,
		headersSent,
		"Content-Length",
		statSync(resolvedPath).size.toString(),
	);

	pipeFile(raw, headersSent, resolvedPath, setStatusCode);
}
