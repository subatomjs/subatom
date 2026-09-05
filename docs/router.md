# Router & Routing

The `Router` class handles HTTP route registration, matching, and dispatch. It supports dynamic parameters, wildcards, grouping, resource routing, and middleware chaining.

## Overview

`Router` is the core routing engine in Subatom. It:
- Registers routes with HTTP methods (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD, TRACE)
- Matches incoming requests to registered routes using Trie-based indexing
- Extracts parameters from dynamic paths (`:id`, `*wildcard`)
- Supports route grouping with shared prefixes and middleware
- Provides resource routing for automatic CRUD endpoints
- Integrates with the pipeline system for transformers, interceptors, and serializers

## Route Basics

### Simple Routes

```typescript
app.get("/", {
  controller: (ctx) => {
    ctx.res.json({ message: "Hello" });
  },
});

app.post("/users", {
  controller: (ctx) => {
    ctx.res.status(201).json({ id: 1 });
  },
});
```

### Dynamic Parameters

Route paths can include dynamic segments that are extracted from the URL:

```typescript
// Single parameter
app.get("/users/:id", {
  controller: (ctx) => {
    const userId = ctx.params.id; // "123" from /users/123
    ctx.res.json({ userId });
  },
});

// Multiple parameters
app.get("/users/:userId/posts/:postId", {
  controller: (ctx) => {
    const userId = ctx.params.userId;
    const postId = ctx.params.postId;
    ctx.res.json({ userId, postId });
  },
});

// Wildcard (matches anything)
app.get("/files/*", {
  controller: (ctx) => {
    ctx.res.json({ path: ctx.params[0] });
  },
});
```

### Query Parameters

Query string parameters are automatically parsed and available in `ctx.query`:

```typescript
app.get("/search", {
  controller: (ctx) => {
    const q = ctx.query.q;      // "typescript" from ?q=typescript
    const limit = ctx.query.limit; // "10" from ?limit=10
    ctx.res.json({ q, limit });
  },
});

// Type-safe with schema
app.get<{
  query: ReturnType<typeof infer.object>;
}>("/search", {
  schema: {
    query: infer.object({
      q: infer.string(),
      limit: infer.string().optional(),
    }),
  },
  controller: (ctx) => {
    // TypeScript knows ctx.query.q is string
    // and ctx.query.limit is string | undefined
  },
});
```

## Route Registration API

### HTTP Methods

All HTTP methods follow the same pattern:

```typescript
app.get(path, options | handler | ...handlers): this
app.post(path, options | handler | ...handlers): this
app.put(path, options | handler | ...handlers): this
app.patch(path, options | handler | ...handlers): this
app.delete(path, options | handler | ...handlers): this
app.options(path, options | handler | ...handlers): this
app.head(path, options | handler | ...handlers): this
app.trace(path, options | handler | ...handlers): this
```

### Route Options

```typescript
interface IRouteOptions<TSchema, TLocals, TUser, TReturn> {
  // Handler function (required)
  controller: (ctx: Context<TSchema, TLocals, TUser>) => unknown | Promise<unknown>;

  // Metadata
  name?: string;              // Route name for URL generation
  tags?: string[];            // OpenAPI tags
  rateLimit?: string;         // Rate limit rule

  // Validation
  schema?: {
    body?: unknown;           // Body validation schema
    query?: unknown;          // Query validation schema
    params?: unknown;         // Params validation schema
    headers?: unknown;        // Headers validation schema
    files?: unknown;          // Single file upload schema
    files?: unknown;         // Multiple files upload schema
  };

  // Middleware
  middleware?: IRouteMiddleware[];
}
```

## Route Matching

Subatom uses a Trie-based route matching algorithm for O(1) lookup:

### Matching Rules

1. **Static segments**: Exact string match
   - `/users` matches `/users` only

2. **Parameter segments**: Match any value
   - `/users/:id` matches `/users/123`, `/users/abc`, etc.
   - Parameter extracted to `ctx.params.id`

3. **Wildcard segments**: Match remaining path
   - `/files/*` matches `/files/a/b/c.txt`
   - Matched path available in `ctx.params`

4. **Priority**: Static > Parameter > Wildcard
   ```typescript
   app.get("/users/me", { controller: () => {} });        // Most specific
   app.get("/users/:id", { controller: () => {} });       // Less specific
   app.get("/users/*", { controller: () => {} });         // Least specific
   ```

### Route Disambiguation

When multiple routes could match, the most specific is chosen:

```typescript
// Requests to /products/featured
app.get("/products/featured", { controller: (ctx) => {} });  // ✓ Chosen
app.get("/products/:id", { controller: (ctx) => {} });       // Not chosen

// Requests to /products/123
app.get("/products/featured", { controller: (ctx) => {} });  // Not chosen
app.get("/products/:id", { controller: (ctx) => {} });       // ✓ Chosen
```

## Route Grouping

Groups allow you to organize related routes with shared prefixes and middleware:

### Basic Grouping

```typescript
app.group("/api/v1", {
  routes: (router) => {
    router.get("/status", { controller: statusHandler });
    router.get("/users", { controller: listUsersHandler });
  },
});

// Routes accessible at /api/v1/status, /api/v1/users
```

### Group with Middleware

```typescript
app.group("/admin", {
  middleware: [requireAdmin],
  routes: (router) => {
    router.get("/users", { controller: listAllUsers });
    router.delete("/users/:id", { controller: deleteUser });
  },
});

// All /admin/* routes require admin authentication
```

### Nested Groups

```typescript
app.group("/api", {
  routes: (router) => {
    router.group("/v1", {
      routes: (v1) => {
        v1.get("/users", { controller: handler });
      },
    });

    router.group("/v2", {
      routes: (v2) => {
        v2.get("/users", { controller: handler });
      },
    });
  },
});

// Routes at /api/v1/users and /api/v2/users
```

### Group Metadata

```typescript
app.group("/internal", {
  name: "internal",
  tags: ["internal"],
  rateLimit: "1000/1m",  // Different rate limit
  middleware: [internalAuth],
  routes: (router) => {
    router.get("/metrics", { controller: metricsHandler });
  },
});
```

## Resource Routing

REST resource routing automatically creates CRUD routes:

```typescript
app.resource("/users", {
  list: (ctx) => {
    // GET /users
    ctx.res.json({ users: [...] });
  },
  create: (ctx) => {
    // POST /users
    ctx.res.status(201).json({ id: 1 });
  },
  show: (ctx) => {
    // GET /users/:id
    const userId = ctx.params.id;
    ctx.res.json({ id: userId });
  },
  update: (ctx) => {
    // PUT /users/:id
    const userId = ctx.params.id;
    ctx.res.json({ id: userId });
  },
  delete: (ctx) => {
    // DELETE /users/:id
    ctx.res.status(204).send();
  },
});
```

### Resource with Middleware

```typescript
app.resource("/admin/settings", {
  middleware: [requireAdmin, auditLog],
  list: getAllSettings,
  create: createSetting,
  show: getSetting,
  update: updateSetting,
  delete: deleteSetting,
  patch: patchSetting,  // Optional
});
```

## Typed Routes

Routes can be fully typed with TypeScript for compile-time safety:

```typescript
import infer from "subatom-infer";
import type { IContext } from "subatom";

const userSchema = {
  body: infer.object({
    name: infer.string(),
    email: infer.string().email(),
  }),
  params: infer.object({ id: infer.string().uuid() }),
  query: infer.object({ filter: infer.string().optional() }),
  headers: infer.object({ authorization: infer.string() }),
};

interface UserLocals {
  userId: string;
  org: Organization;
}

type User = {
  id: string;
  name: string;
  email: string;
};

app.get<typeof userSchema, UserLocals, User, User>("/users/:id", {
  schema: userSchema,
  controller: (ctx: IContext) => {
    // ctx.params.id is typed as string
    // ctx.query.filter is typed as string | undefined
    // ctx.headers.authorization is typed as string
    // ctx.user is typed as User (from route type)
    // ctx.locals is typed as UserLocals

    ctx.res.json({
      id: ctx.params.id,
      name: ctx.body.name,
      email: ctx.body.email,
    });
  },
});
```

## Middleware in Routes

Routes can have route-specific middleware that runs before the handler:

```typescript
app.post("/users", {
  schema: {
    body: userSchema,
  },
  middleware: [
    // Runs before handler
    validateRequestSize,
    checkQuota,
  ],
  controller: async (ctx) => {
    // User and quota already validated
    const user = await createUser(ctx.body);
    ctx.res.status(201).json(user);
  },
});
```

## Route Naming and URL Generation

Routes can be named for URL generation:

```typescript
app.get("/users/:id", {
  name: "getUser",
  controller: (ctx) => {
    ctx.res.json({ id: ctx.params.id });
  },
});

// URL generation (if implemented)
// const url = app.router.url("getUser", { id: "123" });
// // => "/users/123"
```

## Rate Limiting

Routes can specify rate limiting rules:

```typescript
app.get("/expensive-operation", {
  rateLimit: "10/1m",  // 10 requests per minute
  controller: (ctx) => {
    ctx.res.json({ result: "expensive" });
  },
});

app.post("/bulk-action", {
  rateLimit: "100/1h",  // 100 requests per hour
  controller: (ctx) => {
    ctx.res.json({ processed: true });
  },
});
```

Rate limiting is stored in route metadata and can be enforced via middleware:

```typescript
app.use(async (req, res, next) => {
  const route = matchRoute(req.path, req.method);
  if (route?.rateLimit) {
    // Check rate limit with route.rateLimit
    const isAllowed = await rateLimiter.check(req.ip, route.rateLimit);
    if (!isAllowed) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
  }
  next();
});
```

## Error Handling in Routes

Errors thrown in route handlers are caught by error middleware:

```typescript
app.get("/users/:id", {
  controller: async (ctx) => {
    const user = await findUser(ctx.params.id);
    if (!user) {
      throw new NotFoundError(`User ${ctx.params.id} not found`);
    }
    ctx.res.json(user);
  },
});

app.useError((err, req, res, next) => {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
  } else {
    next(err);
  }
});
```

## Router Instance

While `Subatom` is the main application class, you can also create standalone `Router` instances:

```typescript
import { Router } from "subatom";

const apiRouter = new Router();

apiRouter.get("/status", {
  controller: (ctx) => {
    ctx.res.json({ status: "ok" });
  },
});

apiRouter.get("/users/:id", {
  controller: (ctx) => {
    ctx.res.json({ id: ctx.params.id });
  },
});

// Attach to main app
const app = new Subatom();
app.use("/api", apiRouter);
```

### Router Methods

Routers have the same registration methods as Subatom:

```typescript
const router = new Router();

router.get(path, options)
router.post(path, options)
router.put(path, options)
router.patch(path, options)
router.delete(path, options)
router.options(path, options)
router.head(path, options)
router.trace(path, options)

router.group(prefix, options)
router.resource(basePath, options)
router.use(middleware)
router.use(prefix, middleware)
```

## Production Best Practices

### 1. Route Organization

```typescript
// Organize related routes in separate routers
const usersRouter = new Router();
usersRouter.resource("/users", {
  list: listUsers,
  create: createUser,
  show: getUser,
  update: updateUser,
  delete: deleteUser,
});

const postsRouter = new Router();
postsRouter.resource("/posts", {
  list: listPosts,
  create: createPost,
  show: getPost,
  update: updatePost,
  delete: deletePost,
});

// Mount at API root
const app = new Subatom();
app.use("/api/v1", usersRouter, postsRouter);
```

### 2. Parameter Validation

```typescript
app.get<{
  params: Record<string, unknown>;
}>("/users/:id", {
  schema: {
    params: infer.object({
      id: infer.string().uuid("Invalid user ID"),
    }),
  },
  controller: (ctx) => {
    // params.id is guaranteed to be a valid UUID
    ctx.res.json({ id: ctx.params.id });
  },
});
```

### 3. Consistent Naming

```typescript
// Use consistent naming: resource-action pattern
app.resource("/users", {
  list: listUsers,           // GET /users
  create: createUser,        // POST /users
  show: getUser,            // GET /users/:id
  update: updateUser,       // PUT /users/:id
  delete: deleteUser,       // DELETE /users/:id
  patch: patchUser,         // PATCH /users/:id
});
```

### 4. API Versioning

```typescript
const app = new Subatom();

// V1 API
app.group("/api/v1", {
  routes: (v1) => {
    v1.resource("/users", v1Handlers);
  },
});

// V2 API with breaking changes
app.group("/api/v2", {
  routes: (v2) => {
    v2.resource("/users", v2Handlers);
  },
});
```

### 5. Deprecated Routes

```typescript
app.get("/legacy/endpoint", {
  middleware: [
    (req, res, next) => {
      res.set("Deprecation", "true");
      res.set("Sunset", "Sun, 31 Dec 2024 23:59:59 GMT");
      next();
    },
  ],
  controller: (ctx) => {
    ctx.res.json({ deprecated: true, useInstead: "/api/v2/endpoint" });
  },
});
```

## Common Pitfalls

### ❌ Parameter Type Confusion

```typescript
// Wrong: params are always strings
app.get("/items/:limit", {
  controller: (ctx) => {
    // ctx.params.limit is string "10", not number 10
    const items = await db.items.find().limit(ctx.params.limit);
  },
});

// Correct
app.get<{
  params: Record<string, unknown>;
}>("/items/:limit", {
  schema: {
    params: infer.object({
      limit: infer.string().transform(Number).pipe(infer.number().positive()),
    }),
  },
  controller: (ctx) => {
    // ctx.params.limit is properly typed number
    const items = await db.items.find().limit(ctx.params.limit);
  },
});
```

### ❌ Route Shadowing

```typescript
// Wrong: order matters!
app.get("/items/:id", handler1);    // Matches /items/new
app.get("/items/new", handler2);    // Never reached

// Correct: more specific first
app.get("/items/new", handler2);    // Matches /items/new
app.get("/items/:id", handler1);    // Matches /items/123
```

### ❌ Forgetting Async/Await

```typescript
// Wrong: Database call not awaited
app.get("/users/:id", {
  controller: (ctx) => {
    const user = db.users.findById(ctx.params.id); // Missing await
    ctx.res.json(user); // undefined!
  },
});

// Correct
app.get("/users/:id", {
  controller: async (ctx) => {
    const user = await db.users.findById(ctx.params.id);
    ctx.res.json(user);
  },
});
```

## Next Steps

- Learn about [Context](./context.md) for type-safe request/response handling
- Implement [Middleware](./middleware.md) for cross-cutting concerns
- Set up [Validation](./validation.md) for request data
- Configure [Error Handling](./error-handling.md) for production
