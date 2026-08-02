// middleware/serveStatic.ts
import fs from "node:fs";
import path from "node:path";
import { Request } from "../http/Request.js";
import { Response as SubatomResponse } from "../http/Response.js";
import { getMimeType } from "../../utils/mime.js";

export interface StaticOptions {
  index?: string;
  dotfiles?: "allow" | "ignore" | "deny";
  autoCreateDir?: boolean; // 👈 Added option (default: true)
}

export function serveStatic(rootPath: string, options: StaticOptions = {}) {
  const absoluteRoot = path.resolve(rootPath);
  const indexFile = options.index ?? "index.html";
  const dotfiles = options.dotfiles ?? "ignore";
  const autoCreateDir = options.autoCreateDir ?? true;

  // 1. Automatically create directory if it doesn't exist
  if (autoCreateDir && !fs.existsSync(absoluteRoot)) {
    fs.mkdirSync(absoluteRoot, { recursive: true });
    console.log(`[Subatom]: Created missing static directory at ${absoluteRoot}`);
  }

  return async (
    req: Request<any, any, any, any>,
    res: SubatomResponse,
    next: () => void | Promise<void>
  ) => {
    const method = (req.raw.method || req.method || "GET").toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
      return next();
    }

    const [rawPath] = (req.raw.url || req.url || "/").split("?");
    const relativePath = decodeURIComponent(rawPath || "/");

    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, "");
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

      const contentType = getMimeType(targetPath);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stats.size.toString());

      if (method === "HEAD") {
        res.status(200).end();
        return;
      }

      res.status(200);
      const stream = fs.createReadStream(targetPath);

      stream.on("error", () => {
        if (!res.raw.headersSent) {
          next();
        }
      });

      stream.pipe(res.raw);
    } catch {
      return next();
    }
  };
}