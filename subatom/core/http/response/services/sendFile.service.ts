import { createReadStream, existsSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, isAbsolute, resolve } from "node:path";
import type { SendFileOptions } from "../../../../types/http/IResponse.js";
import { MIME_TYPES } from "../../../utils/mime.js";
import { setHeader } from "./setHeader.service.js";

export function resolveSafePath(
	filePath: string,
	root?: string,
): string | null {
	if (!root) {
		return isAbsolute(filePath) ? filePath : resolve(filePath);
	}

	const resolvedRoot = resolve(root);
	const resolvedPath = resolve(resolvedRoot, filePath);

	if (
		resolvedPath !== resolvedRoot &&
		!resolvedPath.startsWith(resolvedRoot + "/")
	) {
		return null;
	}
	return resolvedPath;
}

export function handleStreamError(
	raw: ServerResponse,
	headersSent: boolean,
	err: NodeJS.ErrnoException,
	setStatusCode: (code: number) => void,
): void {
	console.error("[Subatom Error]: Stream failure while writing response.", err);
	if (!headersSent) {
		setStatusCode(500);
		raw.end("Internal Server Error");
	} else if (!raw.writableEnded) {
		raw.end();
	}
}

export function pipeFile(
	raw: ServerResponse,
	headersSent: boolean,
	resolvedPath: string,
	setStatusCode: (code: number) => void,
): void {
	const fileStream = createReadStream(resolvedPath);
	fileStream.on("error", (err) =>
		handleStreamError(raw, headersSent, err, setStatusCode),
	);
	fileStream.pipe(raw);
}

export function sendFile(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	filePath: string,
	options: SendFileOptions,
	setStatusCode: (code: number) => void,
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
