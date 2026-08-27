import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type WebSocket from "ws";

export type WebSocketReadyState = 0 | 1 | 2 | 3;

export type WebSocketMessageData = string | Buffer | ArrayBuffer | Buffer[];

export type WebSocketSendPayload =
	| string
	| Buffer
	| Uint8Array
	| ArrayBuffer
	| object;

export interface IWebSocketConnection<
	TParams extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TQuery extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TLocals extends Record<string, any> = Record<string, any>,
> {
	readonly id: string;
	readonly raw: WebSocket;
	readonly request: IncomingMessage;
	readonly params: TParams;
	readonly query: TQuery;
	readonly path: string;
	readonly ip: string;
	readonly rooms: ReadonlySet<string>;
	readonly readyState: WebSocketReadyState;
	readonly bufferedAmount: number;
	locals: TLocals;

	send(data: WebSocketSendPayload): boolean;
	sendAsync(data: WebSocketSendPayload): Promise<void>;
	sendJson(data: unknown): boolean;
	sendJsonAsync(data: unknown): Promise<void>;
	join(room: string): void;
	leave(room: string): void;
	leaveAll(): void;
	broadcast(
		room: string,
		data: WebSocketSendPayload,
		excludeSelf?: boolean,
	): void;
	ping(data?: any): void;
	pong(data?: any): void;
	close(code?: number, reason?: string): void;
	terminate(): void;
}

export interface IWebSocketVerifyClientInfo {
	origin: string;
	secure: boolean;
	req: IncomingMessage;
	params: Record<string, string>;
	query: Record<string, string>;
	pathname: string;
	socket: Socket;
}

export type WebSocketVerifyClientFn = (
	req: IncomingMessage,
	info: IWebSocketVerifyClientInfo,
) => boolean | Promise<boolean>;

export interface IWebSocketRouteOptions {
	verifyClient?: WebSocketVerifyClientFn | undefined;
	maxMessagesPerSecond?: number | undefined;
	maxPayloadBytes?: number | undefined;
	backpressureLimitBytes?: number | undefined;
	allowOrigins?: string[] | ((origin: string) => boolean) | undefined;
	protocols?: string[] | undefined;
}

export interface IWebSocketHandlers<
	TParams extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TQuery extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TLocals extends Record<string, any> = Record<string, any>,
> {
	options?: IWebSocketRouteOptions | undefined;
	onConnection?: (
		connection: IWebSocketConnection<TParams, TQuery, TLocals>,
	) => void | Promise<void>;
	onMessage?: (
		connection: IWebSocketConnection<TParams, TQuery, TLocals>,
		data: WebSocketMessageData,
		isBinary: boolean,
	) => void | Promise<void>;
	onJson?: (
		connection: IWebSocketConnection<TParams, TQuery, TLocals>,
		data: any,
	) => void | Promise<void>;
	onClose?: (
		connection: IWebSocketConnection<TParams, TQuery, TLocals>,
		code: number,
		reason: string,
	) => void | Promise<void>;
	onError?: (
		connection: IWebSocketConnection<TParams, TQuery, TLocals>,
		error: Error,
	) => void | Promise<void>;
	onPing?: (
		connection: IWebSocketConnection<TParams, TQuery, TLocals>,
		data: Buffer,
	) => void | Promise<void>;
	onPong?: (
		connection: IWebSocketConnection<TParams, TQuery, TLocals>,
		data: Buffer,
	) => void | Promise<void>;
	onDrain?: (
		connection: IWebSocketConnection<TParams, TQuery, TLocals>,
	) => void | Promise<void>;
}

export interface IWebSocketRoute {
	path: string;
	handlers: IWebSocketHandlers<any, any, any>;
}

export interface IWebSocketOptions {
	heartbeatIntervalMs?: number | undefined;
	maxConnections?: number | undefined;
	maxMessagesPerSecond?: number | undefined;
	maxPayloadBytes?: number | undefined;
	shutdownTimeoutMs?: number | undefined;
	perMessageDeflate?: boolean | object | undefined;
	backpressureLimitBytes?: number | undefined;
	verifyClient?: WebSocketVerifyClientFn | undefined;
	allowOrigins?: string[] | ((origin: string) => boolean) | undefined;
	handleProtocols?: (
		protocols: Set<string>,
		req: IncomingMessage,
	) => string | false;
}