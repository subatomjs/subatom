import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { WebSocketServer } from "ws";
import type {
	IWebSocketOptions,
	IWebSocketRoute,
} from "../../../types/websocket/IWebSocket.js";
import { matchPath } from "../../router/services/pathMatcher.service.js";

export interface IWebSocketMatch {
	route: IWebSocketRoute;
	params: Record<string, string>;
	query: Record<string, string>;
	pathname: string;
}

export function matchWebSocketRoute(
	routes: Map<string, IWebSocketRoute>,
	rawUrl: string,
): IWebSocketMatch | undefined {
	let pathname: string;
	let query: Record<string, string> = {};

	try {
		const parsed = new URL(rawUrl, "http://localhost");
		pathname = parsed.pathname;
		query = Object.fromEntries(parsed.searchParams.entries());
	} catch {
		return undefined;
	}

	const normalizedPathname =
		pathname.length > 1 && pathname.endsWith("/")
			? pathname.slice(0, -1)
			: pathname;

	const direct = routes.get(normalizedPathname) || routes.get(pathname);
	if (direct) {
		return {
			route: direct,
			params: {},
			query,
			pathname,
		};
	}

	for (const route of routes.values()) {
		const matchedParams = matchPath(route.path, pathname);
		if (matchedParams !== null) {
			return {
				route,
				params: matchedParams,
				query,
				pathname,
			};
		}
	}

	return undefined;
}

function checkOrigin(
	originHeader: string | undefined,
	allowOrigins: string[] | ((origin: string) => boolean) | undefined,
): boolean {
	if (!allowOrigins) return true;
	const origin = originHeader ?? "";
	if (typeof allowOrigins === "function") {
		return allowOrigins(origin);
	}
	if (Array.isArray(allowOrigins)) {
		return allowOrigins.includes("*") || allowOrigins.includes(origin);
	}
	return true;
}

export async function handleUpgrade(
	request: IncomingMessage,
	socket: Socket,
	head: Buffer,
	wss: WebSocketServer,
	routes: Map<string, IWebSocketRoute>,
	options: IWebSocketOptions,
): Promise<void> {
	const match = matchWebSocketRoute(routes, request.url ?? "/");

	if (!match) {
		const body = "Not Found";
		if (socket.writable) {
			socket.write(
				`HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
			);
		}
		socket.destroy();
		return;
	}

	const { route, params, query, pathname } = match;
	(request as any).params = params;
	(request as any).query = query;
	(request as any).pathname = pathname;

	const originHeader = request.headers.origin as string | undefined;
	const allowedOrigin =
		checkOrigin(originHeader, route.handlers.options?.allowOrigins) &&
		checkOrigin(originHeader, options.allowOrigins);

	if (!allowedOrigin) {
		const body = "Forbidden Origin";
		if (socket.writable) {
			socket.write(
				`HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
			);
		}
		socket.destroy();
		return;
	}

	const guard = route.handlers.options?.verifyClient ?? options.verifyClient;
	if (guard) {
		let allowed = false;
		try {
			allowed = await guard(request, {
				origin: originHeader ?? "",
				secure:
					(socket as any).encrypted === true ||
					request.headers["x-forwarded-proto"] === "https",
				req: request,
				params,
				query,
				pathname,
				socket,
			});
		} catch (err) {
			console.error(
				"[Subatom WS] verifyClient threw:",
				(err as Error).message,
			);
			allowed = false;
		}

		if (!allowed) {
			const body = "Unauthorized";
			if (socket.writable) {
				socket.write(
					`HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
				);
			}
			socket.destroy();
			return;
		}
	}

	if (socket.destroyed || !socket.writable) {
		return;
	}

	(request as any).__subatomRoute = route;
	(request as any).__subatomContext = { params, query, pathname };

	try {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit("connection", ws, request);
		});
	} catch (upgradeErr) {
		console.error(
			"[Subatom WS] wss.handleUpgrade failure:",
			(upgradeErr as Error).message,
		);
		socket.destroy();
	}
}