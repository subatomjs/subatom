# Subatom Core Class

The `Subatom` class is the main entry point for building applications. It orchestrates route registration, middleware management, server lifecycle, and graceful shutdown.

## Overview

`Subatom` is a fluent, chainable API that allows you to:
- Register routes with typed schemas
- Attach middleware and error handlers
- Configure transformers, interceptors, and serializers
- Manage server lifecycle and graceful shutdown
- Generate OpenAPI documentation

## API Reference

### Constructor

```typescript
import infer from "subatom-infer";

constructor(envOptions?: IEnvOptions): Subatom
```

Creates a new Subatom application instance with optional environment configuration.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `envOptions` | `IEnvOptions?` | Environment loading options (`.env` file path, etc.) |

**Returns:** `Subatom` instance

**Example:**
```typescript
const app = new Subatom();
const appWithEnv = new Subatom({ envPath: ".env.production" });
```

### Configuration

#### setConfig

```typescript
setConfig(config: ISubatomServerConfig): this
```

Sets server configuration at runtime. Configuration can also be loaded from files or environment variables.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `ISubatomServerConfig` | Server configuration object |

**Configuration Properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `port` | `number` | 3000 | Server listening port |
| `host` | `string` | "0.0.0.0" | Server listening host/IP |
| `trustProxy` | `boolean` | false | Trust X-Forwarded-* headers |
| `maxRequestSize` | `string` | "100kb" | Max body size limit |
| `maxConcurrentRequests` | `number` | 0 (unlimited) | Limit concurrent requests |
| `requestTimeout` | `number` | 30000ms | Request processing timeout |
| `socketTimeout` | `number` | 120000ms | Socket idle timeout |

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.setConfig({
  port: 8080,
  host: "localhost",
  maxConcurrentRequests: 1000,
  trustProxy: true,
});
```

### Route Registration

#### get, post, put, patch, delete, options, head, trace

```typescript
get<TSchema, TLocals, TUser, TReturn>(
  path: string,
  options: IRouteOptions<TSchema, TLocals, TUser, TReturn>
): this

get(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this
```

Registers an HTTP GET route (similar methods for other HTTP verbs).

**Type Parameters:**

| Parameter | Description |
|-----------|-------------|
| `TSchema` | Route schema defining body, query, params, headers, files |
| `TLocals` | Type of `ctx.locals` object |
| `TUser` | Type of `ctx.user` object |
| `TReturn` | Expected return type from controller |

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Route path with parameters (e.g., "/users/:id") |
| `options` | `IRouteOptions` | Route configuration or controller function |

**IRouteOptions Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `controller` | `IController` | Route handler function |
| `name?` | `string` | Route name for URL generation |
| `tags?` | `string[]` | OpenAPI tags for documentation |
| `rateLimit?` | `string` | Rate limit rule (e.g., "100/1m") |
| `schema?` | `IRouteSchema` | Request/response validation schemas |
| `middleware?` | `IRouteMiddleware[]` | Route-scoped middleware |

**Example:**
```typescript
// Simple route
app.get("/", {
  controller: (ctx) => {
    ctx.res.json({ message: "Hello" });
  },
});

// Typed route with validation
app.get<{
  params: Record<string, unknown>;
  response: User;
}>("/users/:id", {
  name: "getUser",
  tags: ["users"],
  schema: {
    params: infer.object({ id: infer.string().uuid() }),
  },
  controller: (ctx) => {
    const user = await db.users.find(ctx.params.id);
    ctx.res.json(user);
  },
});

// Multiple handlers
app.get("/users", (ctx) => {
  // Shorthand: direct handler function
  ctx.res.json({ users: [] });
});
```

### Middleware

#### use

```typescript
use(fnOrPrefix: MiddlewareHandler | string, ...rest: Array<MiddlewareHandler | IRouter>): this
```

Registers global or path-scoped middleware.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `fnOrPrefix` | `MiddlewareHandler \| string` | Middleware function or route prefix |
| `rest` | `MiddlewareHandler[] \| IRouter[]` | Additional middleware or routers |

**MiddlewareHandler Signature:**
```typescript
type MiddlewareHandler = (req: IRequest, res: IResponse, next: NextFunction) => unknown | Promise<unknown>
```

**Returns:** `this` (for chaining)

**Example:**
```typescript
// Global middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Middleware with error handling
app.use(async (req, res, next) => {
  try {
    await next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Path-scoped middleware
app.use("/api", apiAuthMiddleware, apiRouter);

// Multiple middleware
app.use(loggerMiddleware, corsMiddleware, bodyParserMiddleware);
```

#### useError

```typescript
useError(handler: ErrorMiddlewareHandler): this
```

Registers global error middleware with 4 parameters: (error, req, res, next).

**ErrorMiddlewareHandler Signature:**
```typescript
type ErrorMiddlewareHandler = (
  error: Error,
  req: IRequest,
  res: IResponse,
  next: NextFunction
) => unknown | Promise<unknown>
```

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.useError((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    error: err.message,
    code: err.errorCode,
  });
});

// Fallback error handler
app.useError((err, req, res) => {
  res.status(500).json({ error: "Internal Server Error" });
});
```

### Pipeline Modifiers

#### transformer

```typescript
transformer(transformer: ITransformer): this
```

Registers a global transformer affecting all requests/responses.

**ITransformer Interface:**
```typescript
interface ITransformer {
  name?: string;
  priority?: number;  // Lower runs first (default: 0)
  beforeRequest?: (ctx: IPipelineContext) => unknown | Promise<unknown>;
  afterRequest?: (data: unknown, ctx: IPipelineContext) => unknown | Promise<unknown>;
  beforeResponse?: (ctx: IPipelineContext) => unknown | Promise<unknown>;
  afterResponse?: (ctx: IPipelineContext) => unknown | Promise<unknown>;
}
```

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.transformer({
  name: "auth",
  priority: -10,  // Run first
  beforeRequest: async (ctx) => {
    const token = ctx.req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new UnauthorizedError();
    ctx.state.user = await verifyToken(token);
  },
});

app.transformer({
  name: "response-time",
  afterResponse: (ctx) => {
    const time = Date.now() - ctx.state.startTime;
    ctx.res.set("X-Response-Time", `${time}ms`);
  },
});
```

#### intercept

```typescript
intercept(interceptor: IInterceptor): this
```

Registers a global interceptor for pre-processing requests before route handlers.

**IInterceptor Interface:**
```typescript
interface IInterceptor {
  name?: string;
  priority?: number;
  intercept: (ctx: IPipelineContext, next: InterceptorNext) => unknown | Promise<unknown>;
}

type InterceptorNext = () => Promise<unknown>;
```

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.intercept({
  name: "request-validation",
  async intercept(ctx, next) {
    // Pre-processing
    ctx.state.startTime = Date.now();
    try {
      await next();
    } finally {
      // Post-processing
      console.log(`Request took ${Date.now() - ctx.state.startTime}ms`);
    }
  },
});
```

#### serializer

```typescript
serializer(serializer: ISerializer): this
```

Registers a global response serializer.

**ISerializer Interface:**
```typescript
interface ISerializer {
  name?: string;
  priority?: number;
  contentType?: string;  // e.g., "application/xml"
  serialize: (data: unknown, ctx: IPipelineContext) => unknown | Promise<unknown>;
}
```

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.serializer({
  name: "json-indent",
  contentType: "application/json",
  serialize: (data) => {
    return JSON.stringify(data, null, 2);
  },
});

app.serializer({
  name: "xml-serialize",
  contentType: "application/xml",
  serialize: (data) => {
    return objectToXml(data);
  },
});
```

### Routing Features

#### group

```typescript
group(prefix: string, router: IRouter): this
group(prefix: string, options: IGroupOptions): this
group(prefix?: string): RouteGroupBuilder
```

Creates a route group with shared prefix and middleware.

**Returns:** `this` or `RouteGroupBuilder` for fluent chaining

**Example:**
```typescript
// With explicit router
const apiRouter = new Router();
apiRouter.get("/status", { controller: handler });
app.group("/api/v1", apiRouter);

// With options
app.group("/admin", {
  prefix: "/admin",
  middleware: [adminAuthMiddleware],
  tags: ["admin"],
  rateLimit: "50/1m",
  routes: (router) => {
    router.get("/users", { controller: listUsersHandler });
    router.post("/users", { controller: createUserHandler });
  },
});

// Fluent builder
app.group("/api")
  .get("/status", { controller: handler })
  .post("/users", { controller: handler })
  .nested("/admin", (admin) => {
    admin.get("/stats", { controller: handler });
  });
```

#### resource

```typescript
resource(
  basePath: string,
  optionsOrController: IResourceOptions | IResourceController,
  legacyOptions?: IResourceOptions
): this
```

Automatically registers REST CRUD routes for a resource.

**Generates Routes:**
- `GET /resource` → list
- `POST /resource` → create
- `GET /resource/:id` → show
- `PUT /resource/:id` → update
- `DELETE /resource/:id` → delete
- `PATCH /resource/:id` → patch (optional)

**Example:**
```typescript
app.resource("/users", {
  list: (ctx) => ctx.res.json({ users: [] }),
  create: (ctx) => ctx.res.status(201).json({ id: 1 }),
  show: (ctx) => ctx.res.json({ id: ctx.params.id }),
  update: (ctx) => ctx.res.json({ id: ctx.params.id }),
  delete: (ctx) => ctx.res.status(204).send(),
});

// With middleware
app.resource("/posts", {
  middleware: [requireAuth],
  list: listPostsHandler,
  create: createPostHandler,
  show: getPostHandler,
  update: updatePostHandler,
  delete: deletePostHandler,
});
```

### Server Lifecycle

#### listen

```typescript
async listen(portOrConfig?: number | ISubatomServerConfig): Promise<Server>
```

Starts the HTTP server and begins accepting requests.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `portOrConfig` | `number \| ISubatomServerConfig?` | Port number or config object |

**Returns:** `Promise<Server>` - The Node.js HTTP Server instance

**Example:**
```typescript
// Simple: use default config
const server = await app.listen();

// With port
const server = await app.listen(8080);

// With full config
const server = await app.listen({
  port: 8080,
  host: "0.0.0.0",
  trustProxy: true,
  maxConcurrentRequests: 1000,
});
```

#### gracefulShutdown

```typescript
async gracefulShutdown(exitCode?: number): Promise<void>
```

Gracefully shuts down the server, draining in-flight requests and closing connections.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `exitCode` | `number?` | Exit code for process.exit() |

**Behavior:**
1. Stop accepting new connections
2. Wait for in-flight requests to complete (with timeout)
3. Close all open sockets
4. Clean up resources
5. Exit process if exitCode provided

**Example:**
```typescript
const server = await app.listen(3000);

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  await app.gracefulShutdown(0);
});

process.on("SIGINT", async () => {
  console.log("Interrupt received");
  await app.gracefulShutdown(130);
});
```

## Production Best Practices

### 1. Configuration Management

```typescript
const app = new Subatom();

// Load config from environment
app.setConfig({
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  trustProxy: process.env.TRUST_PROXY === "true",
  maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT || "1000", 10),
});
```

### 2. Error Handling Setup

```typescript
// Development error handler
if (process.env.NODE_ENV === "development") {
  app.useError((err, req, res) => {
    console.error(err.stack);
    res.status(err.statusCode || 500).json({
      error: err.message,
      stack: err.stack,
      code: err.errorCode,
    });
  });
} else {
  // Production error handler
  app.useError((err, req, res) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? "Internal Server Error" : err.message,
      code: err.errorCode,
    });
  });
}
```

### 3. Middleware Ordering

```typescript
// 1. Logging (first)
app.use(loggerMiddleware);

// 2. Request parsing
app.use(bodyParserMiddleware);

// 3. Security
app.use(corsMiddleware);
app.use(rateLimitMiddleware);

// 4. Authentication
app.use(authMiddleware);

// 5. Your routes
app.get("/", { controller: handler });
```

### 4. Health Check Endpoint

```typescript
app.get("/health", {
  controller: (ctx) => {
    ctx.res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  },
});
```

### 5. Graceful Shutdown

```typescript
const app = new Subatom();
const server = await app.listen(3000);

const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);
  await app.gracefulShutdown(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

## Common Pitfalls

### ❌ Forgetting to await listen()

```typescript
// Wrong
app.listen(3000);
// Server not actually started!

// Correct
await app.listen(3000);
```

### ❌ Not handling errors in middleware

```typescript
// Wrong
app.use(async (req, res, next) => {
  const data = await risky(); // No try-catch!
  res.json(data);
});

// Correct
app.use(async (req, res, next) => {
  try {
    const data = await risky();
    res.json(data);
  } catch (err) {
    next(err);  // Pass to error middleware
  }
});
```

### ❌ Modifying middleware array after listen()

```typescript
// Wrong
const app = new Subatom();
await app.listen(3000);
app.use(newMiddleware);  // Won't apply to existing routes!

// Correct
const app = new Subatom();
app.use(existingMiddleware);
await app.listen(3000);
```

### ❌ Missing graceful shutdown handlers

```typescript
// Wrong: Process exits immediately
const app = new Subatom();
await app.listen(3000);
// SIGTERM kills process, losing in-flight requests!

// Correct
const app = new Subatom();
await app.listen(3000);

process.on("SIGTERM", async () => {
  await app.gracefulShutdown(0);
});
```

## Chainable Methods

All registration methods are chainable for fluent API:

```typescript
const app = new Subatom()
  .setConfig({ port: 3000 })
  .use(corsMiddleware)
  .use(authMiddleware)
  .transformer(myTransformer)
  .intercept(myInterceptor)
  .get("/", { controller: handler1 })
  .post("/users", { controller: handler2 })
  .useError(errorHandler);

await app.listen();
```

## Next Steps

- Learn about [Routing](./router.md) with groups and resources
- Explore [Context](./context.md) for request/response facades
- Implement [Error Handling](./error-handling.md) patterns
- Set up [Validation](./validation.md) for request data
