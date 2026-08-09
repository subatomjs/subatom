import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { WebSocketConnection } from "./WebSocketConnection.js";
import { ConnectionRegistry } from "./services/connectionRegistry.service.js";
import { handleUpgrade } from "./services/upgradeHandler.service.js";
import { startHeartbeat } from "./services/heartbeat.service.js";
import { dispatchMessage } from "./services/messageDispatcher.service.js";
import { shutdownConnections } from "./services/gracefulShutdown.service.js";
import { broadcastAll } from "./services/broadcast.service.js";
import {
  IWebSocketHandlers,
  IWebSocketOptions,
  IWebSocketRoute,
} from "../../types/framework/websocket/IWebSocket.js";

const DEFAULT_OPTIONS: Required<
  Pick<
    IWebSocketOptions,
    | "heartbeatIntervalMs"
    | "maxConnections"
    | "maxMessagesPerSecond"
    | "maxPayloadBytes"
    | "shutdownTimeoutMs"
    | "perMessageDeflate"
  >
> = {
  heartbeatIntervalMs: 30_000,
  maxConnections: Infinity,
  maxMessagesPerSecond: 20,
  maxPayloadBytes: 1024 * 1024,
  shutdownTimeoutMs: 5_000,
  perMessageDeflate: true,
};

/**
 * Owns the `ws.Server` and everything socket-related. Created unconditionally
 * alongside SubatomServer (cheap — no listeners attached yet), but only wired
 * into the http server's 'upgrade' event when config.websocket is true, via
 * activate(). This keeps the feature zero-cost when disabled.
 */
export class WebSocketManager {
  private readonly routes = new Map<string, IWebSocketRoute>();
  private readonly registry = new ConnectionRegistry();
  private wss?: WebSocketServer;
  private heartbeatTimer?: NodeJS.Timeout;
  private options: IWebSocketOptions = {};
  private active = false;

  constructor(private readonly httpServer: HttpServer) {}

  public register(path: string, handlers: IWebSocketHandlers): void {
    if (this.routes.has(path)) {
      throw new Error(`[Subatom WS] Route "${path}" is already registered.`);
    }
    this.routes.set(path, { path, handlers });
  }

  public get connectionCount(): number {
    return this.registry.size();
  }

  public get isActive(): boolean {
    return this.active;
  }

  public activate(userOptions: IWebSocketOptions = {}): void {
    if (this.active) return;
    this.active = true;
    this.options = { ...DEFAULT_OPTIONS, ...userOptions };

    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: this.options.maxPayloadBytes,
      perMessageDeflate: this.options.perMessageDeflate,
    });

    this.httpServer.on("upgrade", (request, socket, head) => {
      if (this.registry.size() >= (this.options.maxConnections ?? Infinity)) {
        socket.write(
          "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
        );
        socket.destroy();
        return;
      }

      handleUpgrade(
        request,
        socket as any,
        head,
        this.wss!,
        this.routes,
        this.options,
        (rawSocket, req, route) =>
          this.onConnectionEstablished(rawSocket, req, route),
      ).catch((err) => {
        console.error("[Subatom WS] Upgrade handling failed:", err.message);
        socket.destroy();
      });
    });

    this.heartbeatTimer = startHeartbeat(
      this.registry,
      this.options.heartbeatIntervalMs ?? DEFAULT_OPTIONS.heartbeatIntervalMs,
    );
  }

  // WebSocketManager.ts (updated methods)

  private onConnectionEstablished(
    rawSocket: WebSocket,
    request: IncomingMessage,
    route: IWebSocketRoute,
  ): void {
    const maxMsgs =
      route.handlers.options?.maxMessagesPerSecond ??
      this.options.maxMessagesPerSecond ??
      DEFAULT_OPTIONS.maxMessagesPerSecond;

    const connection = new WebSocketConnection(
      rawSocket,
      request,
      this.registry,
      maxMsgs,
    );
    this.registry.add(connection);

    rawSocket.on("pong", () => {
      connection._isAlive = true;
    });

    rawSocket.on("message", (data, isBinary) => {
      dispatchMessage(connection, route.handlers, data, isBinary);
    });

    rawSocket.on("close", (code, reasonBuf) => {
      this.registry.remove(connection);
      try {
        route.handlers.onClose?.(connection, code, reasonBuf.toString());
      } catch (err) {
        console.error(
          "[Subatom WS] onClose handler threw:",
          (err as Error).message,
        );
      }
    });

    rawSocket.on("error", (err) => {
      this.registry.remove(connection); // Fix: Purge connection on error
      try {
        route.handlers.onError?.(connection, err);
      } catch (handlerErr) {
        console.error(
          "[Subatom WS] onError handler threw:",
          (handlerErr as Error).message,
        );
      }
    });

    try {
      route.handlers.onConnection?.(connection);
    } catch (err) {
      console.error(
        "[Subatom WS] onConnection handler threw:",
        (err as Error).message,
      );
    }
  }

  // Fix: Allow passing excludeId to global broadcast
  public broadcast(data: string | Buffer | object, excludeId?: string): void {
    broadcastAll(this.registry, data, excludeId);
  }

  public async shutdown(timeoutMs?: number): Promise<void> {
    if (!this.active) return;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await shutdownConnections(
      this.registry,
      timeoutMs ??
        this.options.shutdownTimeoutMs ??
        DEFAULT_OPTIONS.shutdownTimeoutMs,
    );
    this.wss?.close();
    this.active = false;
  }
}
