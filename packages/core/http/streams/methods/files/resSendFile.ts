/**
 * @fileoverview Streams a local file directly to the client with root path validation against directory traversal.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import * as fs from "node:fs";
import type { ServerResponse } from "node:http";
import * as path from "node:path";
import type { SendFileOptions } from "../../types/stream.methods.types.js";

export function resSendFile(
	res: ServerResponse,
	filePath: string,
	options: SendFileOptions = {},
): void {
	if (res.headersSent) {
		throw new Error("[Subatom File Error]: Headers already sent.");
	}

	const resolvedPath = options.root
		? path.resolve(options.root, filePath)
		: path.resolve(filePath);

	if (options.root) {
		const rootPath = path.resolve(options.root);
		if (!resolvedPath.startsWith(rootPath)) {
			res.statusCode = 403;
			res.end("Forbidden: Path traversal restriction.");
			return;
		}
	}

	fs.stat(resolvedPath, (err, stats) => {
		if (err || !stats.isFile()) {
			res.statusCode = 404;
			res.end("File Not Found");
			return;
		}

		res.statusCode = 200;
		if (options.contentType) {
			res.setHeader("Content-Type", options.contentType);
		}
		res.setHeader("Content-Length", stats.size.toString());

		const fileStream = fs.createReadStream(resolvedPath);
		fileStream.on("error", (streamErr) => {
			if (!res.headersSent) {
				res.statusCode = 500;
				res.end("Failed to read file.");
			} else {
				res.destroy(streamErr);
			}
		});

		fileStream.pipe(res);
	});
}
