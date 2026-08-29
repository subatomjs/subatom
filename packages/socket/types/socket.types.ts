/**
 * @fileoverview Type provider for socket features of subatom.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type WebSocket from "ws";

export type SocketReadyState = 0 | 1 | 2 | 3;

export type SocketMessageData = string | Buffer | ArrayBuffer | Buffer[];

export type SocketSendPayload =
	| string
	| Buffer
	| Uint8Array
	| ArrayBuffer
	| object;

export interface ISocketConnection<
	TParams extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TQuery extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TLocals extends Record<string, unknown> = Record<string, unknown>,
> {
	readonly id: string;
	readonly raw: WebSocket;
	readonly request: IncomingMessage;
	readonly params: TParams;
	readonly query: TQuery;
	readonly path: string;
	readonly ip: string;
	readonly rooms: ReadonlySet<string>;
	readonly readyState: SocketReadyState;
	readonly bufferedAmount: number;
	locals: TLocals;

	send(data: SocketSendPayload): boolean;
	sendAsync(data: SocketSendPayload): Promise<void>;
	sendJson(data: unknown): boolean;
	sendJsonAsync(data: unknown): Promise<void>;
	join(room: string): void;
	leave(room: string): void;
	leaveAll(): void;
	broadcast(room: string, data: SocketSendPayload, excludeSelf?: boolean): void;
	ping(data?: unknown): void;
	pong(data?: unknown): void;
	close(code?: number, reason?: string): void;
	terminate(): void;
}

export interface ISocketVerifyClientInfo {
	origin: string;
	secure: boolean;
	req: IncomingMessage;
	params: Record<string, string>;
	query: Record<string, string>;
	pathname: string;
	socket: Socket;
}

export type SocketVerifyClientFn = (
	req: IncomingMessage,
	info: ISocketVerifyClientInfo,
) => boolean | Promise<boolean>;

export interface ISocketRouteOptions {
	verifyClient?: SocketVerifyClientFn | undefined;
	maxMessagesPerSecond?: number | undefined;
	maxPayloadBytes?: number | undefined;
	backpressureLimitBytes?: number | undefined;
	allowOrigins?: string[] | ((origin: string) => boolean) | undefined;
	protocols?: string[] | undefined;
}

export interface ISocketHandlers<
	TParams extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TQuery extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TLocals extends Record<string, unknown> = Record<string, unknown>,
> {
	options?: ISocketRouteOptions | undefined;
	onConnection?: (
		connection: ISocketConnection<TParams, TQuery, TLocals>,
	) => void | Promise<void>;
	onMessage?: (
		connection: ISocketConnection<TParams, TQuery, TLocals>,
		data: SocketMessageData,
		isBinary: boolean,
	) => void | Promise<void>;
	onJson?: (
		connection: ISocketConnection<TParams, TQuery, TLocals>,
		data: unknown,
	) => void | Promise<void>;
	onClose?: (
		connection: ISocketConnection<TParams, TQuery, TLocals>,
		code: number,
		reason: string,
	) => void | Promise<void>;
	onError?: (
		connection: ISocketConnection<TParams, TQuery, TLocals>,
		error: Error,
	) => void | Promise<void>;
	onPing?: (
		connection: ISocketConnection<TParams, TQuery, TLocals>,
		data: Buffer,
	) => void | Promise<void>;
	onPong?: (
		connection: ISocketConnection<TParams, TQuery, TLocals>,
		data: Buffer,
	) => void | Promise<void>;
	onDrain?: (
		connection: ISocketConnection<TParams, TQuery, TLocals>,
	) => void | Promise<void>;
}

export interface ISocketRoute {
	path: string;
	handlers: ISocketHandlers<
		Record<string, string | undefined>,
		Record<string, string | undefined>,
		Record<string, unknown>
	>;
}

export interface ISocketOptions {
	heartbeatIntervalMs?: number | undefined;
	maxConnections?: number | undefined;
	maxMessagesPerSecond?: number | undefined;
	maxPayloadBytes?: number | undefined;
	shutdownTimeoutMs?: number | undefined;
	perMessageDeflate?: boolean | object | undefined;
	backpressureLimitBytes?: number | undefined;
	verifyClient?: SocketVerifyClientFn | undefined;
	allowOrigins?: string[] | ((origin: string) => boolean) | undefined;
	handleProtocols?: (
		protocols: Set<string>,
		req: IncomingMessage,
	) => string | false;
}

export type ResolvedSocketOptions = {
	heartbeatIntervalMs: number;
	maxConnections: number;
	maxMessagesPerSecond: number;
	maxPayloadBytes: number;
	shutdownTimeoutMs: number;
	perMessageDeflate: boolean | object;
	backpressureLimitBytes: number;
};

export interface SubatomIncomingMessage extends IncomingMessage {
	params?: Record<string, string>;
	query?: Record<string, string>;
	pathname?: string;
	__subatomRoute?: ISocketRoute;
	__subatomContext?: {
		params: Record<string, string>;
		query: Record<string, string>;
		pathname: string;
	};
}

export interface SocketWithInternalSocket extends WebSocket {
	_socket?: Socket;
}

export interface ISocketMatch {
	route: ISocketRoute;
	params: Record<string, string>;
	query: Record<string, string>;
	pathname: string;
}
