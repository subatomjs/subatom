import * as path from "node:path";
import type { ServerResponse } from "node:http";
import { resSendFile, SendFileOptions } from "./resSendFile.js";

export interface DownloadOptions extends SendFileOptions {
    filename?: string;
}

/**
 * Forces browser download via Content-Disposition headers and streams file contents.
 */
export function resDownload(
    res: ServerResponse,
    filePath: string,
    filename?: string,
    options: DownloadOptions = {}
): void {
    const downloadName = filename || path.basename(filePath);
    const encodedFilename = encodeURIComponent(downloadName);

    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${downloadName.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedFilename}`
    );

    resSendFile(res, filePath, options);
}