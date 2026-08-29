/**
 * @fileoverview Forces browser download via Content-Disposition headers and streams file contents.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import * as path from "node:path";
import type { DownloadOptions } from "../../types/stream.methods.types.js";
import { resSendFile } from "./resSendFile.js";

export function resDownload(
	res: ServerResponse,
	filePath: string,
	filename?: string,
	options: DownloadOptions = {},
): void {
	const downloadName = filename || path.basename(filePath);
	const encodedFilename = encodeURIComponent(downloadName);

	res.setHeader(
		"Content-Disposition",
		`attachment; filename="${downloadName.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedFilename}`,
	);

	resSendFile(res, filePath, options);
}
