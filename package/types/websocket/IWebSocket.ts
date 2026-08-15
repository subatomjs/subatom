import type { IncomingMessage } from "node:http";
import type WebSocket from "ws";

export type WebSocketReadyState = 0 | 1 | 2 | 3;

export interface IWebSocketOptions {
	/** Max inbound frame size in bytes. Default 1MB. */
	maxPayloadBytes?: number;
	/** Interval (ms) between heartbeat pings used to reap dead connections. Default 30000. */
	heartbeatIntervalMs?: number;
	/** Hard cap on concurrent connections for this process. Default Infinity. */
	maxConnections?: number;
	/** Token-bucket cap on inbound messages/sec per connection. Default 20. */
	maxMessagesPerSecond?: number;
	/** Async/sync guard invoked before the handshake completes (auth, origin checks, etc). */
	verifyClient?: (request: IncomingMessage) => boolean | Promise<boolean>;
	/** Grace period (ms) given to connections to close cleanly on shutdown. Default 5000. */
	shutdownTimeoutMs?: number;
	/** permessage-deflate compression. Default true. */
	perMessageDeflate?: boolean;
}

export interface IWebSocketConnection {
	readonly id: string;
	readonly raw: WebSocket;
	readonly request: IncomingMessage;
	readonly rooms: ReadonlySet<string>;
	readonly readyState: WebSocketReadyState;
	locals: Record<string, any>;
	send(data: string | Buffer | object): boolean;
	join(room: string): void;
	leave(room: string): void;
	broadcast(room: string, data: string | Buffer | object): void;
	close(code?: number, reason?: string): void;
	terminate(): void;
}

export type WebSocketMessageData = string | Buffer | ArrayBuffer | Buffer[];

export interface IWebSocketHandlers {
	onConnection?: (socket: IWebSocketConnection) => void | Promise<void>;
	onMessage?: (
		socket: IWebSocketConnection,
		data: WebSocketMessageData,
		isBinary: boolean,
	) => void | Promise<void>;
	onClose?: (
		socket: IWebSocketConnection,
		code: number,
		reason: string,
	) => void | Promise<void>;
	onError?: (socket: IWebSocketConnection, error: Error) => void;
	/** Per-route override of manager-level options (verifyClient, rate limit, etc). */
	options?: Partial<IWebSocketOptions>;
}

export interface IWebSocketRoute {
	path: string;
	handlers: IWebSocketHandlers;
}
