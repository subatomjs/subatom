/**
 * @fileoverview responsible for show logs on terminal.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import pc from "picocolors";

export type LogLevel = "info" | "success" | "warn" | "error" | "debug";

export type LogScope =
	| "BOOT"
	| "CONFIG"
	| "SERVER"
	| "HTTP"
	| "ROUTER"
	| "MIDDLEWARE"
	| "REQUEST"
	| "RESPONSE"
	| "VALIDATION"
	| "OPENAPI"
	| "PLUGIN"
	| "CLI"
	| "SHUTDOWN";

export interface LogContext {
	scope?: LogScope | string;
	[key: string]: unknown;
}

export interface DocumentationUrls {
	swagger?: string;
	redoc?: string;
	openapi?: string;
}

interface LevelConfig {
	label: string;
	color: (value: string) => string;
}

const LEVELS: Record<LogLevel, LevelConfig> = {
	info: {
		label: "INFO ",
		color: pc.cyan,
	},
	success: {
		label: " OK  ",
		color: pc.green,
	},
	warn: {
		label: "WARN ",
		color: pc.yellow,
	},
	error: {
		label: "ERROR",
		color: pc.red,
	},
	debug: {
		label: "DEBUG",
		color: pc.magenta,
	},
};

const timestamp = (): string =>
	pc.dim(
		new Date().toLocaleTimeString("en-GB", {
			hour12: false,
		}),
	);

const formatValue = (value: unknown): string => {
	if (typeof value === "string") {
		return value;
	}

	if (value instanceof Error) {
		return value.message;
	}

	if (value === null) {
		return "null";
	}

	if (value === undefined) {
		return "undefined";
	}

	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return "[object]";
		}
	}

	return String(value);
};

const formatContext = (context?: LogContext): string => {
	if (!context) {
		return "";
	}

	const entries = Object.entries(context).filter(([key]) => key !== "scope");

	if (entries.length === 0) {
		return "";
	}

	return (
		" " +
		entries
			.map(([key, value]) => `${pc.dim(key)}=${formatValue(value)}`)
			.join(" ")
	);
};

/**
 * Creates a clickable terminal hyperlink using ANSI OSC 8.
 *
 * Supported terminals will make the URL clickable.
 * Unsupported terminals will still display the URL.
 */
const link = (label: string, url: string): string => {
	return `\u001B]8;;${url}\u0007${pc.underline(label)}\u001B]8;;\u0007`;
};

const write = (
	level: LogLevel,
	message: string,
	context?: LogContext,
): void => {
	const config = LEVELS[level];

	const scope = context?.scope ? pc.dim(`[${context.scope}]`) : "";

	const output =
		`${timestamp()} ` +
		`${config.color(config.label)} ` +
		`${pc.bold(pc.blue("SUBATOM"))} ` +
		`${scope} ` +
		`${message}` +
		`${formatContext(context)}`;

	if (level === "error") {
		console.error(output);
	} else {
		console.log(output);
	}
};

const separator = (): void => {
	console.log(pc.dim(`  ${"─".repeat(56)}`));
};

export const logger = {
	info(message: string, context?: LogContext): void {
		write("info", message, context);
	},

	success(message: string, context?: LogContext): void {
		write("success", message, context);
	},

	warn(message: string, context?: LogContext): void {
		write("warn", message, context);
	},

	error(message: string, context?: LogContext): void {
		write("error", message, context);
	},

	debug(message: string, context?: LogContext): void {
		write("debug", message, context);
	},

	/**
	 * Print a server startup message.
	 */
	server(options: { host: string; port: number; protocol?: string }): void {
		const protocol = options.protocol ?? "http";
		const url = `${protocol}://${options.host}:${options.port}`;

		console.log();
		console.log(`${pc.green("✔")} ${pc.bold("Server running")}`);
		console.log();
		console.log(`  ${pc.dim("Local")}       ${link(url, url)}`);
	},

	/**
	 * Print OpenAPI documentation URLs.
	 */
	documentation(urls: DocumentationUrls): void {
		const entries: Array<[string, string]> = [];

		if (urls.swagger) {
			entries.push(["Swagger UI", urls.swagger]);
		}

		if (urls.redoc) {
			entries.push(["ReDoc", urls.redoc]);
		}

		if (urls.openapi) {
			entries.push(["OpenAPI", urls.openapi]);
		}

		if (entries.length === 0) {
			return;
		}

		console.log();
		console.log(`  ${pc.bold(pc.cyan("Documentation"))}`);

		separator();

		for (const [name, url] of entries) {
			console.log(`  ${pc.dim(name.padEnd(12))} ${link(url, url)}`);
		}

		console.log();
	},

	/**
	 * Print the complete framework startup information.
	 */
	startup(options: {
		host: string;
		port: number;
		protocol?: string;
		routes?: number;
		documentation?: DocumentationUrls;
	}): void {
		const protocol = options.protocol ?? "http";
		const url = `${protocol}://${options.host}:${options.port}`;

		console.log();
		console.log(pc.bold(pc.cyan("  SubAtom")));
		console.log(pc.dim("  TypeScript HTTP Framework"));
		console.log();

		separator();

		if (options.routes !== undefined) {
			write("success", "Routes registered", {
				scope: "ROUTER",
				routes: options.routes,
			});
		}

		write("success", "Server listening", {
			scope: "SERVER",
			url,
		});

		if (options.documentation) {
			const docs = options.documentation;

			if (docs.swagger || docs.redoc || docs.openapi) {
				console.log();
				console.log(`  ${pc.bold(pc.cyan("Documentation"))}`);

				separator();

				if (docs.swagger) {
					console.log(
						`  ${pc.dim("Swagger UI".padEnd(12))} ${link(
							docs.swagger,
							docs.swagger,
						)}`,
					);
				}

				if (docs.redoc) {
					console.log(
						`  ${pc.dim("ReDoc".padEnd(12))} ${link(docs.redoc, docs.redoc)}`,
					);
				}

				if (docs.openapi) {
					console.log(
						`  ${pc.dim("OpenAPI".padEnd(12))} ${link(
							docs.openapi,
							docs.openapi,
						)}`,
					);
				}
			}
		}

		console.log();
	},

	/**
	 * Print a shutdown message.
	 */
	shutdown(message = "Server shutting down"): void {
		console.log();
		write("info", message, {
			scope: "SHUTDOWN",
		});
	},
};
