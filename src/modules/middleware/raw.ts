// middleware/raw.ts
import { Request } from "../http/Request.js";
import { Response as SubatomResponse } from "../http/Response.js";
import { parseLimit } from "../../utils/parseLimit.js";

export interface RawOptions {
  limit?: string | number;
  type?: string | string[];
}

export function raw(options: RawOptions = {}) {
  const maxBytes = parseLimit(options.limit ?? "100kb");
  const acceptedType = options.type ?? "application/octet-stream";

  return async (
    req: Request<any, any, any, any>,
    res: SubatomResponse,
    next: () => void | Promise<void>,
  ) => {
    // 1. Only process requests with matching content-type or requests that carry a body
    const contentType = req.raw.headers["content-type"] || "";
    const hasBody =
      req.raw.headers["content-length"] || req.raw.headers["transfer-encoding"];

    const matchesType = Array.isArray(acceptedType)
      ? acceptedType.some((type) => contentType.includes(type))
      : contentType.includes(acceptedType);

    if (!hasBody || !matchesType) {
      req.body = Buffer.alloc(0);
      return next();
    }

    // 2. Early Content-Length check if the header is provided
    const contentLength = parseInt(
      req.raw.headers["content-length"] || "0",
      10,
    );
    if (contentLength > maxBytes) {
      res.status(413).json({
        success: false,
        message: "Payload Too Large",
      });
      return;
    }

    // 3. Stream data buffer aggregation with real-time size tracking
    try {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of req.raw) {
        totalBytes += chunk.length;

        // Enforce byte limit during chunk streaming
        if (totalBytes > maxBytes) {
          res.status(413).json({
            success: false,
            message: "Payload Too Large",
          });
          return;
        }

        chunks.push(chunk);
      }

      // 4. Attach aggregated raw Buffer to req.body
      req.body = Buffer.concat(chunks);

      await next();
    } catch (error) {
      // 5. Catch stream read or memory errors
      res.status(400).json({
        success: false,
        message: "Bad Request: Error reading raw payload",
      });
    }
  };
}
