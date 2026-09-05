# Middleware & Pipeline System

Subatom's middleware and pipeline system provides multiple points for intercepting and modifying requests and responses. Understand the differences between middleware, transformers, interceptors, and serializers.

## Middleware Basics

Middleware are functions that have access to request and response objects and can modify them or respond early.

### Middleware Signature

```typescript
type MiddlewareHandler = (
  req: IRequest,
  res: IResponse,
  next: NextFunction
) => unknown | Promise<unknown>;

type NextFunction = () => Promise<void>;
```

### Global Middleware

Global middleware runs on every request:

```typescript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use(async (req, res, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  res.set("X-Response-Time", `${duration}ms`);
});
```

### Path-Scoped Middleware

Middleware attached to a path prefix:

```typescript
app.use("/api", (req, res, next) => {
  // Only runs for /api/* requests
  req.locals.apiVersion = "v1";
  next();
});

app.use("/admin", requireAdmin, (req, res, next) => {
  // Only runs for /admin/* requests
  // After requireAdmin middleware
  req.locals.role = "admin";
  next();
});
```

### Route-Scoped Middleware

Middleware attached to specific routes:

```typescript
app.get("/protected", {
  middleware: [
    (req, res, next) => {
      // Only runs for this route
      if (!req.headers.authorization) {
        res.status(401).json({ error: "No auth" });
        return;
      }
      next();
    },
  ],
  controller: (ctx) => {
    ctx.res.json({ protected: true });
  },
});
```

## Common Middleware Patterns

### Logging Middleware

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  const originalEnd = res.raw.end;

  res.raw.end = function (...args: unknown[]) {
    const duration = Date.now() - start;
    console.log({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });
    return originalEnd.apply(res.raw, args);
  };

  next();
});
```

### Authentication Middleware

```typescript
const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "No token" });
    return;
  }

  try {
    const user = await verifyJWT(token);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

app.use(requireAuth);
```

### CORS Middleware

```typescript
const cors = (options = {}) => {
  return (req, res, next) => {
    res.set("Access-Control-Allow-Origin", options.origin || "*");
    res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send();
      return;
    }

    next();
  };
};

app.use(cors({ origin: "https://example.com" }));
```

### Rate Limiting Middleware

```typescript
const rateLimit = (options = {}) => {
  const store = new Map<string, number[]>();
  const limit = options.max || 100;
  const windowMs = options.windowMs || 60 * 1000;

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const timestamps = store.get(key) || [];
    const withinWindow = timestamps.filter((t) => t > now - windowMs);

    if (withinWindow.length >= limit) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    withinWindow.push(now);
    store.set(key, withinWindow);
    next();
  };
};

app.use(rateLimit({ max: 100, windowMs: 60 * 1000 }));
```

### Body Parser Middleware

```typescript
const bodyParser = (maxSize = "1mb") => {
  return async (req, res, next) => {
    if (["GET", "HEAD"].includes(req.method)) {
      next();
      return;
    }

    try {
      req.body = await req.json();  // Subatom helper
      next();
    } catch (err) {
      res.status(400).json({ error: "Invalid JSON" });
    }
  };
};

app.use(bodyParser());
```

## Error Middleware

Error middleware has 4 parameters for handling errors:

```typescript
type ErrorMiddlewareHandler = (
  error: Error,
  req: IRequest,
  res: IResponse,
  next: NextFunction
) => unknown | Promise<unknown>;
```

### Basic Error Handler

```typescript
app.useError((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: "Internal Server Error",
    code: "INTERNAL_ERROR",
  });
});
```

### Multi-Level Error Handling

```typescript
// Handle validation errors
app.useError((err, req, res, next) => {
  if (err instanceof UnprocessableEntityError) {
    res.status(422).json({
      error: "Validation failed",
      details: err.details,
    });
    return;
  }
  next(err);
});

// Handle not found errors
app.useError((err, req, res, next) => {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next(err);
});

// Fallback error handler
app.useError((err, req, res) => {
  res.status(500).json({ error: "Internal Server Error" });
});
```

## Pipeline Modifiers

Beyond middleware, Subatom provides transformers, interceptors, and serializers for lifecycle hooks.

### Transformers

Transformers hook into request/response lifecycle with priority-based ordering:

```typescript
interface ITransformer {
  name?: string;
  priority?: number;  // Lower runs first
  beforeRequest?: (ctx: IPipelineContext) => unknown | Promise<unknown>;
  afterRequest?: (data: unknown, ctx: IPipelineContext) => unknown | Promise<unknown>;
  beforeResponse?: (ctx: IPipelineContext) => unknown | Promise<unknown>;
  afterResponse?: (ctx: IPipelineContext) => unknown | Promise<unknown>;
}
```

#### beforeRequest

Runs after middleware, before route handler:

```typescript
app.transformer({
  name: "auth-transformer",
  priority: -10,  // Run first
  beforeRequest: async (ctx) => {
    const token = ctx.req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      ctx.req.user = await verifyToken(token);
    }
  },
});
```

#### afterRequest

Runs after route handler completes:

```typescript
app.transformer({
  name: "response-wrapper",
  afterRequest: (data, ctx) => {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  },
});
```

#### beforeResponse

Runs after serialization, before sending to client:

```typescript
app.transformer({
  name: "add-headers",
  beforeResponse: (ctx) => {
    ctx.res.set("X-Response-Time", ctx.state.duration);
    ctx.res.set("Cache-Control", "public, max-age=3600");
  },
});
```

#### afterResponse

Runs after response sent (for logging, cleanup):

```typescript
app.transformer({
  name: "response-logger",
  afterResponse: (ctx) => {
    console.log({
      path: ctx.req.path,
      method: ctx.req.method,
      statusCode: ctx.res.statusCode,
      duration: Date.now() - ctx.state.startTime,
    });
  },
});
```

### Interceptors

Interceptors run before route handler with middleware-style next() pattern:

```typescript
interface IInterceptor {
  name?: string;
  priority?: number;
  intercept: (
    ctx: IPipelineContext,
    next: () => Promise<unknown>
  ) => unknown | Promise<unknown>;
}
```

#### Intercept Pattern

```typescript
app.intercept({
  name: "timing-interceptor",
  async intercept(ctx, next) {
    const start = Date.now();
    try {
      await next();  // Call route handler
    } finally {
      ctx.state.duration = Date.now() - start;
    }
  },
});

app.intercept({
  name: "validation-interceptor",
  async intercept(ctx, next) {
    // Pre-processing before handler
    validateRequest(ctx.req);
    await next();
    // Post-processing after handler
  },
});
```

### Serializers

Serializers handle final response formatting:

```typescript
interface ISerializer {
  name?: string;
  priority?: number;
  contentType?: string;
  serialize: (data: unknown, ctx: IPipelineContext) => unknown | Promise<unknown>;
}
```

#### Multiple Format Serializers

```typescript
app.serializer({
  name: "json-serializer",
  contentType: "application/json",
  serialize: (data) => {
    return JSON.stringify(data);
  },
});

app.serializer({
  name: "xml-serializer",
  contentType: "application/xml",
  serialize: (data) => {
    return objectToXml(data);
  },
});

app.serializer({
  name: "csv-serializer",
  contentType: "text/csv",
  serialize: (data: unknown[]) => {
    return convertToCsv(data);
  },
});
```

## Pipeline Execution Order

```
Request received
    ↓
1. Global Middleware (app.use)
    ↓
2. Group Middleware
    ↓
3. Route Middleware
    ↓
4. Transformers (beforeRequest) - priority order
    ↓
5. Validation
    ↓
6. Interceptors (intercept) - priority order
    ↓
7. Route Handler (controller)
    ↓
8. Transformers (afterRequest) - priority order
    ↓
9. Serializers - priority order
    ↓
10. Transformers (beforeResponse) - priority order
    ↓
11. Send Response
    ↓
12. Transformers (afterResponse) - priority order
```

## Best Practices

### 1. Order Matters

```typescript
// Correct order
app.use(corsMiddleware);          // 1. CORS first
app.use(bodyParserMiddleware);    // 2. Parse body
app.use(authMiddleware);          // 3. Authenticate
app.use(rateLimitMiddleware);     // 4. Rate limit
app.use(loggerMiddleware);        // 5. Logging
```

### 2. Use Priority for Transformers

```typescript
// Auth transformer should run first
app.transformer({
  name: "auth",
  priority: -100,  // Highest priority
  beforeRequest: loadUser,
});

// Logging transformer should run last
app.transformer({
  name: "logging",
  priority: 100,  // Lowest priority
  afterResponse: logRequest,
});
```

### 3. Error Handling in Middleware

```typescript
app.use(async (req, res, next) => {
  try {
    await risky();
    next();
  } catch (err) {
    next(err);  // Pass to error middleware
  }
});
```

### 4. Short-Circuit on Error

```typescript
app.use((req, res, next) => {
  if (req.method !== "GET" && !req.get("content-type")) {
    res.status(400).json({ error: "Content-Type required" });
    return;  // Don't call next()
  }
  next();
});
```

### 5. Middleware Composition

```typescript
const compose = (...middlewares) => {
  return async (req, res, next) => {
    let index = 0;
    const dispatch = async (i) => {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      if (i < middlewares.length) {
        try {
          await middlewares[i](req, res, () => dispatch(i + 1));
        } catch (err) {
          next(err);
        }
      } else {
        next();
      }
    };
    return dispatch(0);
  };
};

app.use(
  compose(
    authMiddleware,
    loggingMiddleware,
    validationMiddleware
  )
);
```

## Common Pitfalls

### ❌ Not Calling next()

```typescript
// Wrong: Request hangs
app.use((req, res, next) => {
  console.log("middleware");
  // Forgot next()!
});

// Correct
app.use((req, res, next) => {
  console.log("middleware");
  next();
});
```

### ❌ Calling next() Multiple Times

```typescript
// Wrong: Undefined behavior
app.use((req, res, next) => {
  next();
  next();  // Double call!
});

// Correct: Call once
app.use((req, res, next) => {
  if (condition) {
    doThing();
  }
  next();  // Single call
});
```

### ❌ Mixing Middleware and Transformers

```typescript
// Wrong: Mixing concerns
app.transformer({
  beforeRequest: (ctx) => {
    // Don't put middleware logic in transformers
    if (!ctx.req.headers.authorization) {
      ctx.res.status(401).send();
      return;
    }
  },
});

// Correct: Use middleware for auth
app.use((req, res, next) => {
  if (!req.headers.authorization) {
    res.status(401).send();
    return;
  }
  next();
});
```

## Next Steps

- Learn about [Error Handling](./error-handling.md) in middleware
- Explore [Context](./context.md) in route handlers
- Implement [Validation](./validation.md) middleware
- Set up [Production Best Practices](./best-practices.md)
