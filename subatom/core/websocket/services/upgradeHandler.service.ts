// services/upgradeHandler.service.ts
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import type {
  IWebSocketOptions,
  IWebSocketRoute,
} from "../../../types/websocket/IWebSocket.js";

export async function handleUpgrade(
  request: IncomingMessage,
  socket: Socket,
  head: Buffer,
  wss: WebSocketServer,
  routes: Map<string, IWebSocketRoute>,
  options: IWebSocketOptions,
  onConnectionEstablished: (
    rawSocket: WebSocket,
    request: IncomingMessage,
    route: IWebSocketRoute,
  ) => void,
): Promise<void> {
  let pathname: string;
  try {
    pathname = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    ).pathname;
  } catch {
    socket.destroy();
    return;
  }

  const route = routes.get(pathname);
  if (!route) {
    // Fix: Use end() to flush response before closing
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    return;
  }

  const guard = route.handlers.options?.verifyClient ?? options.verifyClient;
  if (guard) {
    let allowed: boolean;
    try {
      allowed = await guard(request);
    } catch (err) {
      console.error("[Subatom WS] verifyClient threw:", (err as Error).message);
      allowed = false;
    }
    if (!allowed) {
      // Fix: Use end() to ensure client receives HTTP 401 instead of ECONNRESET
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
  }

  if (!socket.writable) return;

  wss.handleUpgrade(request, socket, head, (rawSocket) => {
    onConnectionEstablished(rawSocket, request, route);
  });
}
