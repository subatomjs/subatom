import type { ServerResponse } from "node:http";
import { acceptsHeader } from "../../request/services/acceptsHeader.service.js";
import { FormatHandlers } from "../../../../types/http/IResponse.js";

/**
 * Performs content negotiation based on the Request Accept header.
 * Executes the matching handler or falls back to 'default' or 406 Not Acceptable.
 */
export function formatResponse(
    res: ServerResponse,
    headers: Record<string, string | string[] | undefined>,
    headersSent: boolean,
    handlers: FormatHandlers,
    setType: (contentType: string) => void
): void {
    if (headersSent) {
        console.warn("[Subatom Warning]: Cannot format response; headers already sent.");
        return;
    }

    const availableFormats = Object.keys(handlers).filter((key) => key !== "default");

    // Find the first format accepted by the client
    let matchedFormat: string | undefined;
    for (const format of availableFormats) {
        if (acceptsHeader(headers, format)) {
            matchedFormat = format;
            break;
        }
    }

    if (matchedFormat && typeof handlers[matchedFormat] === "function") {
        setType(matchedFormat);
        handlers[matchedFormat]!();
    } else if (typeof handlers["default"] === "function") {
        handlers["default"]!();
    } else {
        // RFC 7231: 406 Not Acceptable when server cannot meet client Accept requirements
        res.statusCode = 406;
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                error: "Not Acceptable",
                message: `Server can only supply formats: ${availableFormats.join(", ")}`,
            })
        );
    }
}