import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import type {
	IWebSocketConnection,
	IWebSocketHandlers,
	IWebSocketOptions,
	IWebSocketRoute,
	WebSocketSendPayload,
} from "../../types/websocket/IWebSocket.js";
import { broadcastAll, broadcastToRoom } from "./services/broadcast.service.js";
import { ConnectionRegistry } from "./services/connectionRegistry.service.js";
import { shutdownConnections } from "./services/gracefulShutdown.service.js";
import { startHeartbeat } from "./services/heartbeat.service.js";
import { dispatchMessage } from "./services/messageDispatcher.service.js";
import { handleUpgrade } from "./services/upgradeHandler.service.js";
import { WebSocketConnection } from "./WebSocketConnection.js";

type ResolvedWebSocketOptions = {
	heartbeatIntervalMs: number;
	maxConnections: number;
	maxMessagesPerSecond: number;
	maxPayloadBytes: number;
	shutdownTimeoutMs: number;
	perMessageDeflate: boolean | object;
	backpressureLimitBytes: number;
};

const DEFAULT_OPTIONS: Readonly<ResolvedWebSocketOptions> = {
	heartbeatIntervalMs: 30_000,
	maxConnections: Infinity,
	maxMessagesPerSecond: 100,
	maxPayloadBytes: 1024 * 1024,
	shutdownTimeoutMs: 5_000,
	perMessageDeflate: true,
	backpressureLimitBytes: 1024 * 1024,
};

export class WebSocketManager {
	private readonly routes = new Map<string, IWebSocketRoute>();
	private readonly registry = new ConnectionRegistry();
	private wss?: WebSocketServer | undefined;
	private heartbeatTimer?: NodeJS.Timeout | undefined;
	private options: IWebSocketOptions = {};
	private active = false;
	private upgradeListener?:
		| ((req: IncomingMessage, socket: Socket, head: Buffer) => void)
		| undefined;

	constructor(private readonly httpServer: HttpServer) {}

	public register<
		TParams extends Record<string, string | undefined> = Record<
			string,
			string | undefined
		>,
		TQuery extends Record<string, string | undefined> = Record<
			string,
			string | undefined
		>,
		TLocals extends Record<string, any> = Record<string, any>,
	>(
		path: string,
		handlers: IWebSocketHandlers<TParams, TQuery, TLocals>,
	): void {
		if (this.routes.has(path)) {
			throw new Error(`[Subatom WS] Route "${path}" is already registered.`);
		}
		this.routes.set(path, {
			path,
			handlers: handlers as unknown as IWebSocketHandlers,
		});
	}

	public get connectionCount(): number {
		return this.registry.size();
	}

	public get isActive(): boolean {
		return this.active;
	}

	public getRegistry(): ConnectionRegistry {
		return this.registry;
	}

	public getConnection(id: string): IWebSocketConnection | undefined {
		return this.registry.get(id);
	}

	public getConnections(): IterableIterator<IWebSocketConnection> {
		return this.registry.all();
	}

	public getRoom(room: string): ReadonlyMap<string, IWebSocketConnection> {
		return this.registry.getRoom(room);
	}

	public getRoomNames(): string[] {
		return this.registry.getRoomNames();
	}

	public activate(userOptions: IWebSocketOptions = {}): void {
		if (this.active) return;
		this.active = true;
		this.options = { ...DEFAULT_OPTIONS, ...userOptions };

		this.wss = new WebSocketServer({
			noServer: true,
			maxPayload:
				this.options.maxPayloadBytes ?? DEFAULT_OPTIONS.maxPayloadBytes,
			perMessageDeflate:
				this.options.perMessageDeflate ??
				DEFAULT_OPTIONS.perMessageDeflate,
		});

		this.wss.on("connection", (rawSocket, request) => {
			const route = (request as any).__subatomRoute as IWebSocketRoute;
			const matchedContext = (request as any).__subatomContext as {
				params: Record<string, string>;
				query: Record<string, string>;
				pathname: string;
			};

			if (!route || !matchedContext) {
				rawSocket.terminate();
				return;
			}

			this.onConnectionEstablished(
				rawSocket,
				request,
				route,
				matchedContext,
			);
		});

		this.upgradeListener = (request, socket, head) => {
			const maxConnections =
				this.options.maxConnections ?? DEFAULT_OPTIONS.maxConnections;
			if (this.registry.size() >= maxConnections) {
				const body = "Service Unavailable";
				socket.write(
					`HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
				);
				socket.destroy();
				return;
			}

			handleUpgrade(
				request,
				socket,
				head,
				this.wss!,
				this.routes,
				this.options,
			).catch((err) => {
				console.error(
					"[Subatom WS] Upgrade processing failed:",
					(err as Error).message,
				);
				if (!socket.destroyed) {
					socket.destroy();
				}
			});
		};

		this.httpServer.on("upgrade", this.upgradeListener);

		const intervalMs: number =
			this.options.heartbeatIntervalMs ??
			DEFAULT_OPTIONS.heartbeatIntervalMs;
		if (intervalMs > 0) {
			this.heartbeatTimer = startHeartbeat(this.registry, intervalMs);
		}
	}

	private onConnectionEstablished(
		rawSocket: WebSocket,
		request: IncomingMessage,
		route: IWebSocketRoute,
		matchedContext: {
			params: Record<string, string>;
			query: Record<string, string>;
			pathname: string;
		},
	): void {
		const maxMsgs: number =
			route.handlers.options?.maxMessagesPerSecond ??
			this.options.maxMessagesPerSecond ??
			DEFAULT_OPTIONS.maxMessagesPerSecond;

		const backpressureBytes: number =
			route.handlers.options?.backpressureLimitBytes ??
			this.options.backpressureLimitBytes ??
			DEFAULT_OPTIONS.backpressureLimitBytes;

		const connection = new WebSocketConnection(
			rawSocket,
			request,
			this.registry,
			{
				maxMessagesPerSecond: maxMsgs,
				backpressureLimitBytes: backpressureBytes,
				params: matchedContext.params,
				query: matchedContext.query,
				path: matchedContext.pathname,
			},
		);

		this.registry.add(connection);

		rawSocket.on("pong", (data: Buffer) => {
			connection._isAlive = true;
			try {
				const result = route.handlers.onPong?.(connection, data);
				if (result && typeof (result as Promise<void>).catch === "function") {
					(result as Promise<void>).catch((err) =>
						console.error(
							`[Subatom WS] onPong async handler rejected for ${connection.id}:`,
							(err as Error).message,
						),
					);
				}
			} catch (err) {
				console.error(
					`[Subatom WS] onPong handler threw for ${connection.id}:`,
					(err as Error).message,
				);
			}
		});

		rawSocket.on("ping", (data: Buffer) => {
			try {
				const result = route.handlers.onPing?.(connection, data);
				if (result && typeof (result as Promise<void>).catch === "function") {
					(result as Promise<void>).catch((err) =>
						console.error(
							`[Subatom WS] onPing async handler rejected for ${connection.id}:`,
							(err as Error).message,
						),
					);
				}
			} catch (err) {
				console.error(
					`[Subatom WS] onPing handler threw for ${connection.id}:`,
					(err as Error).message,
				);
			}
		});

		rawSocket.on("message", (data, isBinary) => {
			dispatchMessage(connection, route.handlers, data, isBinary);
		});

		(rawSocket as any)._socket?.on("drain", () => {
			try {
				const result = route.handlers.onDrain?.(connection);
				if (result && typeof (result as Promise<void>).catch === "function") {
					(result as Promise<void>).catch((err) =>
						console.error(
							`[Subatom WS] onDrain async handler rejected for ${connection.id}:`,
							(err as Error).message,
						),
					);
				}
			} catch (err) {
				console.error(
					`[Subatom WS] onDrain handler threw for ${connection.id}:`,
					(err as Error).message,
				);
			}
		});

		rawSocket.on("close", (code, reasonBuf) => {
			connection.leaveAll();
			this.registry.remove(connection);
			try {
				const result = route.handlers.onClose?.(
					connection,
					code,
					reasonBuf ? reasonBuf.toString("utf-8") : "",
				);
				if (
					result &&
					typeof (result as Promise<void>).catch === "function"
				) {
					(result as Promise<void>).catch((err) =>
						console.error(
							`[Subatom WS] onClose async handler rejected for ${connection.id}:`,
							(err as Error).message,
						),
					);
				}
			} catch (err) {
				console.error(
					`[Subatom WS] onClose handler threw for ${connection.id}:`,
					(err as Error).message,
				);
			}
		});

		rawSocket.on("error", (err) => {
			this.registry.remove(connection);
			try {
				const result = route.handlers.onError?.(connection, err);
				if (
					result &&
					typeof (result as Promise<void>).catch === "function"
				) {
					(result as Promise<void>).catch((asyncErr) =>
						console.error(
							`[Subatom WS] onError async handler rejected for ${connection.id}:`,
							(asyncErr as Error).message,
						),
					);
				}
			} catch (handlerErr) {
				console.error(
					`[Subatom WS] onError handler threw for ${connection.id}:`,
					(handlerErr as Error).message,
				);
			}
		});

		try {
			const connResult = route.handlers.onConnection?.(connection);
			if (
				connResult &&
				typeof (connResult as Promise<void>).catch === "function"
			) {
				(connResult as Promise<void>).catch((err) => {
					console.error(
						`[Subatom WS] onConnection async handler rejected for ${connection.id}:`,
						(err as Error).message,
					);
					try {
						route.handlers.onError?.(
							connection,
							err instanceof Error ? err : new Error(String(err)),
						);
					} catch {
						// Suppress secondary handler errors
					}
				});
			}
		} catch (err) {
			console.error(
				`[Subatom WS] onConnection handler threw for ${connection.id}:`,
				(err as Error).message,
			);
			try {
				route.handlers.onError?.(
					connection,
					err instanceof Error ? err : new Error(String(err)),
				);
			} catch {
				// Suppress secondary handler errors
			}
		}
	}

	public broadcast(
		data: WebSocketSendPayload,
		excludeId?: string,
	): void {
		broadcastAll(this.registry, data, excludeId);
	}

	public broadcastTo(
		room: string,
		data: WebSocketSendPayload,
		excludeId?: string,
	): void {
		broadcastToRoom(this.registry, room, data, excludeId);
	}

	public async shutdown(timeoutMs?: number): Promise<void> {
		if (!this.active) return;

		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = undefined;
		}

		if (this.upgradeListener) {
			this.httpServer.removeListener("upgrade", this.upgradeListener);
			this.upgradeListener = undefined;
		}

		const effectiveTimeout: number =
			timeoutMs ??
			this.options.shutdownTimeoutMs ??
			DEFAULT_OPTIONS.shutdownTimeoutMs;

		await shutdownConnections(this.registry, effectiveTimeout);

		if (this.wss) {
			await new Promise<void>((resolve) => {
				this.wss!.close(() => resolve());
			});
			this.wss = undefined;
		}

		this.active = false;
	}
}