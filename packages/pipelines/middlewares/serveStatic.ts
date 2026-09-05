/**
 * @fileoverview This module is responsible for serve static html file as a response.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import fs from "node:fs";
import path from "node:path";
import type { IStaticOptions } from "./types/middleware.types.js";
import type { NextFunction } from "../next/types/nextFunction.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import { getMimeType } from "./utils/index.utils.js";

export function serveStatic(rootPath: string, options: IStaticOptions = {}) {
	const absoluteRoot = path.resolve(rootPath);
	const indexFile = options.index ?? "index.html";
	const dotfiles = options.dotfiles ?? "ignore";
	const autoCreateDir = options.autoCreateDir ?? true;

	// 1. Automatically create directory if it doesn't exist
	if (autoCreateDir && !fs.existsSync(absoluteRoot)) {
		fs.mkdirSync(absoluteRoot, { recursive: true });
		console.log(
			`[Subatom]: Created missing static directory at ${absoluteRoot}`,
		);
	}

	return async (
		req: IRequest,
		res: IResponse,
		next: NextFunction,
	): Promise<void> => {
		const method = (req.raw?.method || req.method || "GET").toUpperCase();

		if (method !== "GET" && method !== "HEAD") {
			return next();
		}

		const [rawPath] = (req.raw?.url || req.url || "/").split("?");
		let relativePath = "/";
		try {
			relativePath = decodeURIComponent(rawPath || "/");
		} catch {
			return next();
		}

		const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
		let targetPath = path.join(absoluteRoot, safePath);

		if (!targetPath.startsWith(absoluteRoot)) {
			return next();
		}

		const filename = path.basename(targetPath);
		if (filename.startsWith(".")) {
			if (dotfiles === "deny") {
				res.status(403).json({ message: "Forbidden" });
				return;
			}
			if (dotfiles === "ignore") {
				return next();
			}
		}

		try {
			let stats = await fs.promises.stat(targetPath);

			if (stats.isDirectory()) {
				targetPath = path.join(targetPath, indexFile);
				try {
					stats = await fs.promises.stat(targetPath);
				} catch {
					return next();
				}
			}

			if (!stats.isFile()) {
				return next();
			}

			if (res.headersSent || res.writableEnded) {
				return;
			}

			const contentType = getMimeType(targetPath) || "application/octet-stream";
			res.setHeader("Content-Type", contentType);
			res.setHeader("Content-Length", stats.size.toString());

			if (method === "HEAD") {
				res.status(200).end();
				return;
			}

			res.status(200);

			// Await stream completion so pipeline runner halts and waits for response to finish
			await new Promise<void>((resolve) => {
				const stream = fs.createReadStream(targetPath);
				let settled = false;
				const cleanup = () => {
					res.raw.off("finish", onFinish);
					res.raw.off("close", onClose);
					stream.off("error", onError);
				};
				const settle = () => {
					if (settled) return;
					settled = true;
					cleanup();
					resolve();
				};
				const onError = (err: Error) => {
					if (!res.headersSent) void next(err);
					settle();
				};
				const onFinish = () => settle();
				const onClose = () => {
					stream.destroy();
					settle();
				};

				stream.once("error", onError);
				res.raw.once("finish", onFinish);
				res.raw.once("close", onClose);

				stream.pipe(res.raw);
			});
		} catch {
			return next();
		}
	};
}
