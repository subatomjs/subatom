import {
  IncomingMessage,
  ServerResponse,
  createServer,
  Server,
} from "node:http";
import net from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";
import { Request } from "../modules/http/Request";
import { Response as SubatomResponse } from "../modules/http/Response";
import { Router } from "./Router";
import { ErrorFormatter } from "../errors/errorFormatter";
import { NotFoundError } from "../errors/Error";

export type MiddlewareHandler = (
  req: Request<any, any, any, any>,
  res: SubatomResponse  ,
  next: (err?: any) => void | Promise<void>,
) => void | Promise<void>;

export type ErrorMiddlewareHandler = (
  err: any,
  req: Request<any, any, any, any>,
  res: SubatomResponse,
  next: (err?: any) => void | Promise<void>,
) => void | Promise<void>;

interface RequestContext {
  req: Request;
  res: SubatomResponse;
}

export class SubatomServer {
  private readonly server: Server;

  /**
   * Tracks {req, res} for whatever request is "in flight" on the current
   * async execution context. This exists purely as a safety net: if a
   * middleware calls next() from inside an un-awaited callback (e.g.
   * `fs.stat(path, (err) => { next() })` instead of awaiting a promisified
   * version), the resulting rejection escapes the try/catch in
   * handleRequest entirely and — without this — becomes a silent,
   * unrecoverable hung connection. AsyncLocalStorage lets us trace an
   * orphaned rejection back to the still-open response and still answer it.
   */
  private readonly requestContext = new AsyncLocalStorage<RequestContext>();

  constructor(
    private readonly router: Router,
    private readonly middlewares: MiddlewareHandler[] = [],
    private readonly errorMiddlewares: ErrorMiddlewareHandler[] = [],
  ) {
    this.server = createServer(this.handleRequest.bind(this));

    // Handle low-level TCP/HTTP connection errors without crashing process
    this.server.on("clientError", (err: Error, socket: net.Socket) => {
      if (socket.writable) {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      } else {
        socket.destroy();
      }
    });
  }

  private async handleRequest(
    native_request: IncomingMessage,
    native_response: ServerResponse,
  ): Promise<void> {
    const request = new Request(native_request);
    const response = new SubatomResponse(native_response);

    await this.requestContext.run({ req: request, res: response }, () =>
      this.runRequestPipeline(request, response),
    );
  }

  private async runRequestPipeline(
    request: Request,
    response: SubatomResponse,
  ): Promise<void> {
    try {
      let globalIndex = 0;

      // 1. Process Global Middlewares registered via app.use()
      const runGlobalPipeline = async (err?: any): Promise<void> => {
        if (err) {
          throw err; // Trigger central error catchment
        }

        if (globalIndex < this.middlewares.length) {
          const middleware = this.middlewares[globalIndex++];
          if (middleware) {
            await middleware(request, response, runGlobalPipeline);
          }
        } else {
          // 2. Route Matching
          const method = request.method ?? "GET";
          const url = request.url ?? "/";
          const matched = this.router.match(method, url);

          if (!matched) {
            throw new NotFoundError(`Cannot ${method} ${url}`);
          }

          // Attach parameters
          request.params = matched.params;
          request.query = matched.query;

          // 3. Execute Route Pipeline
          const handlers = matched.route.handlers;
          let handlerIndex = 0;

          const runRoutePipeline = async (routeErr?: any): Promise<void> => {
            if (routeErr) {
              throw routeErr;
            }

            if (handlerIndex < handlers.length) {
              const handler = handlers[handlerIndex++];
              if (handler) {
                await handler(request, response, runRoutePipeline);
              }
            }
          };

          await runRoutePipeline();
        }
      };

      await runGlobalPipeline();
    } catch (error: any) {
      await this.handleErrorPipeline(error, request, response);
    }
  }

  /**
   * Enterprise Error Dispatcher: Passes error through user error middlewares first,
   * then falls back to SubatomServer ErrorFormatter if unhandled.
   */
  private async handleErrorPipeline(
    err: any,
    req: Request,
    res: SubatomResponse,
  ): Promise<void> {
    // If response stream is already closed, we cannot write headers/body
    if (res.rawResponse.writableEnded) {
      console.error(
        "[SubatomServer Warning]: Error occurred after response was sent:",
        err,
      );
      return;
    }

    let errIndex = 0;

    const runErrorPipeline = async (currentErr: any): Promise<void> => {
      if (errIndex < this.errorMiddlewares.length) {
        const errorMiddleware = this.errorMiddlewares[errIndex++];

        if (!errorMiddleware) {
          await runErrorPipeline(currentErr);
          return;
        }

        try {
          await errorMiddleware(currentErr, req, res, runErrorPipeline);
        } catch (nextErr) {
          await runErrorPipeline(nextErr);
        }
      } else {
        // Fallback to internal framework formatter (renders HTML in dev / JSON in prod)
        ErrorFormatter.handle(currentErr, req, res);
      }
    };

    await runErrorPipeline(err);
  }

  /**
   * Best-effort recovery for a promise rejection that escaped the normal
   * middleware pipeline (e.g. a middleware invoked next() from inside a
   * non-awaited callback). If we can identify which in-flight request this
   * rejection belongs to via AsyncLocalStorage, and that request hasn't
   * already been answered, route the error through the standard error
   * pipeline instead of leaving the client's socket hanging.
   *
   * Returns true if the rejection was handled (a response was sent or
   * attempted), false if there was nothing we could do with it — in which
   * case the caller should fall back to logging it as a fatal/unexpected error.
   */
  public tryRecoverFromOrphanedRejection(reason: any): boolean {
    const store = this.requestContext.getStore();

    if (!store) {
      return false; // Not something we can tie back to a request.
    }

    const { req, res } = store;

    if (res.rawResponse.writableEnded || res.rawResponse.headersSent) {
      return false; // Already answered — nothing left to recover.
    }

    console.error(
      "[SubatomServer Warning]: Recovered an orphaned promise rejection that " +
        "escaped the middleware pipeline. This usually means a middleware " +
        "called next() from inside a callback instead of awaiting it " +
        "(e.g. raw fs.stat instead of fs.promises.stat). Routing the error " +
        "through the standard error formatter so the client still gets a response.",
    );

    void this.handleErrorPipeline(reason, req, res);
    return true;
  }

  /**
   * Probes for available port recursively if occupied
   */
  private getAvailablePort(port: number, host: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();

      probe.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          resolve(this.getAvailablePort(port + 1, host));
        } else {
          reject(err);
        }
      });

      probe.once("listening", () => {
        probe.close(() => resolve(port));
      });

      probe.listen(port, host);
    });
  }

  /**
   * Starts server on available port
   */
  public async listen(
    port: number = 8080,
    host: string = "localhost",
    appName: string = "subatom",
    callback?: (assignedPort: number) => void,
  ): Promise<Server> {
    const availablePort = await this.getAvailablePort(Number(port), host);

    if (availablePort !== Number(port)) {
      console.warn(
        `[${appName}] Port ${port} is in use. Automatically switched to ${availablePort}.`,
      );
    }

    return this.server.listen(availablePort, host, () => {
      console.log(`${appName} is running on http://${host}:${availablePort}`);
      if (callback) {
        callback(availablePort);
      }
    });
  }

  /**
   * Graceful server close implementation
   */
  public close(callback?: (err?: Error) => void): Server {
    return this.server.close(callback);
  }
}
