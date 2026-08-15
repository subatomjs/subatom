// src/config/ConfigValidator.ts
import type { SubatomConfig } from "../types/config/SubatomConfig.js";

export class ConfigError extends Error {
    constructor(key: string, expected: string, received: unknown) {
        const safeReceived = typeof received === "string" && received.length > 50 
            ? "[REDACTED OR TRUNCATED]" 
            : String(received);
        super(`[Subatom Config Error]: Invalid value for "${key}". Expected ${expected}, received: ${safeReceived}`);
        this.name = "ConfigError";
    }
}

export function validateConfig(config: SubatomConfig): void {
    if (typeof config.port !== "number" || isNaN(config.port) || config.port < 1 || config.port > 65535) {
        throw new ConfigError("port", "a valid port number (1-65535)", config.port);
    }
    if (typeof config.host !== "string" || config.host.trim() === "") {
        throw new ConfigError("host", "a non-empty string", config.host);
    }
    if (typeof config.entry !== "string" || config.entry.trim() === "") {
        throw new ConfigError("entry", "a non-empty file path string", config.entry);
    }
    if (typeof config.outDir !== "string" || config.outDir.trim() === "") {
        throw new ConfigError("outDir", "a non-empty directory path string", config.outDir);
    }
    if (typeof config.sourcemap !== "boolean") {
        throw new ConfigError("sourcemap", "a boolean", config.sourcemap);
    }
    if (typeof config.minify !== "boolean") {
        throw new ConfigError("minify", "a boolean", config.minify);
    }
    if (typeof config.websocket !== "boolean") {
        throw new ConfigError("websocket", "a boolean", config.websocket);
    }
    if (config.websocketOptions && typeof config.websocketOptions !== "object") {
         throw new ConfigError("websocketOptions", "an object", typeof config.websocketOptions);
    }
    if (config.watch && (!Array.isArray(config.watch.extensions) || !Array.isArray(config.watch.ignore))) {
        throw new ConfigError("watch", "an object containing arrays for extensions and ignore", config.watch);
    }
}