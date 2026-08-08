import type { ISubatomServerConfig } from "../../../../types/framework/core/IFrameworkCore.js";
import type { IWebSocketRoute } from "../../../../types/framework/websocket/IWebSocket.js";
import type {
  ErrorMiddlewareHandler,
  MiddlewareHandler,
} from "../../../../types/http/IMiddleware.js";
import type { Router } from "../../../router/Router.js";
import { SubatomServer } from "../../subatom-server/SubatomServer.js";

export function ensureServerInstance(
  currentServer: SubatomServer | undefined,
  router: Router,
  middlewares: MiddlewareHandler[],
  errorMiddlewares: ErrorMiddlewareHandler[],
  customConfig: ISubatomServerConfig,
  wsRoutes: IWebSocketRoute[],
): SubatomServer {
  if (!currentServer) {
    const server = new SubatomServer(
      router,
      middlewares,
      errorMiddlewares,
      wsRoutes,
    );
    server.setConfig(customConfig);
    return server;
  }
  return currentServer;
}

export function performGracefulShutdown(
  serverInstance: SubatomServer | undefined,
  exitCode: number = 0,
): void {
  console.log("[Subatom] Shutting down active connections...");
  if (serverInstance) {
    serverInstance.close(() => {
      console.log("[Subatom] Server successfully closed.");
      process.exit(exitCode);
    });
  } else {
    process.exit(exitCode);
  }
}
