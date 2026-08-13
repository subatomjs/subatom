import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type WebSocket from "ws";
import type { ConnectionRegistry } from "./services/connectionRegistry.service.js";
import { TokenBucket } from "./services/rateLimiter.service.js";
import {
  IWebSocketConnection,
  WebSocketReadyState,
} from "../../types/websocket/IWebSocket.js";

/**
 * Thin, safe wrapper around a raw `ws` socket. Never expose the raw socket's
 * send() directly to user handlers — this class adds backpressure checks,
 * JSON convenience, and room bookkeeping on top of it.
 */
export class WebSocketConnection implements IWebSocketConnection {
  public readonly id = randomUUID();
  public locals: Record<string, any> = {};

  /** @internal heartbeat liveness flag, flipped by pong events */
  public _isAlive = true;
  /** @internal per-connection inbound rate limiter */
  public readonly _rateLimiter: TokenBucket;

  private readonly _rooms = new Set<string>();

  constructor(
    public readonly raw: WebSocket,
    public readonly request: IncomingMessage,
    private readonly registry: ConnectionRegistry,
    maxMessagesPerSecond: number,
  ) {
    this._rateLimiter = new TokenBucket(
      maxMessagesPerSecond,
      maxMessagesPerSecond,
    );
  }

  public get rooms(): ReadonlySet<string> {
    return this._rooms;
  }

  public get readyState(): WebSocketReadyState {
    return this.raw.readyState as WebSocketReadyState;
  }

  public send(data: string | Buffer | object): boolean {
    if (this.raw.readyState !== this.raw.OPEN) return false;

    // Backpressure guard — drop rather than let a slow client balloon
    // process memory. Callers can check the return value if delivery matters.
    if (this.raw.bufferedAmount > 1_000_000) return false;

    const payload =
      typeof data === "string" || Buffer.isBuffer(data)
        ? data
        : JSON.stringify(data);

    this.raw.send(payload, (err) => {
      if (err) {
        console.error(
          `[Subatom WS] Send failed for connection ${this.id}:`,
          err.message,
        );
      }
    });
    return true;
  }

  public join(room: string): void {
    this._rooms.add(room);
    this.registry.joinRoom(room, this);
  }

  public leave(room: string): void {
    this._rooms.delete(room);
    this.registry.leaveRoom(room, this);
  }

  public broadcast(room: string, data: string | Buffer | object): void {
    for (const member of this.registry.getRoom(room)) {
      if (member.id !== this.id) member.send(data);
    }
  }

  public close(code = 1000, reason = ""): void {
    try {
      this.raw.close(code, reason);
    } catch {
      this.raw.terminate();
    }
  }

  public terminate(): void {
    this.raw.terminate();
  }
}
