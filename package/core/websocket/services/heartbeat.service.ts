// services/heartbeat.service.ts
import type { ConnectionRegistry } from "./connectionRegistry.service.js";
import type { WebSocketConnection } from "../WebSocketConnection.js";

export function startHeartbeat(
  registry: ConnectionRegistry,
  intervalMs: number,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    for (const connection of registry.all() as IterableIterator<WebSocketConnection>) {
      if (!connection._isAlive) {
        registry.remove(connection); // Fix: Remove from registry before terminating
        connection.terminate();
        continue;
      }
      connection._isAlive = false;
      try {
        connection.raw.ping();
      } catch {
        registry.remove(connection); // Fix: Clean up on ping write failure
        connection.terminate();
      }
    }
  }, intervalMs);

  timer.unref();
  return timer;
}