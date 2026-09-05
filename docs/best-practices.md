# Production Best Practices

This guide covers best practices for deploying and operating Subatom applications in production environments.

## Application Setup

### Structure

Organize your application for maintainability:

```
my-app/
├── src/
│   ├── index.ts              # Application entry
│   ├── routes/
│   │   ├── users.ts
│   │   ├── posts.ts
│   │   └── health.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── logging.ts
│   │   └── cors.ts
│   ├── services/
│   │   ├── user.service.ts
│   │   └── post.service.ts
│   ├── config/
│   │   └── database.ts
│   └── errors/
│       └── custom.errors.ts
├── subatom.config.ts
├── .env
├── .env.production
└── package.json
```

### Entry Point

Clean application initialization:

```typescript
// src/index.ts
import { Subatom } from "subatom";
import infer from "subatom-infer";
import { ConfigManager } from "subatom";
import usersRouter from "./routes/users";
import postsRouter from "./routes/posts";
import healthRouter from "./routes/health";
import setupMiddleware from "./middleware";
import setupErrorHandling from "./errors";

async function main() {
  const app = new Subatom();

  // Load configuration
  await ConfigManager.resolve();

  // Setup middleware
  setupMiddleware(app);

  // Register routes
  app.use("/api/users", usersRouter);
  app.use("/api/posts", postsRouter);
  app.use("/health", healthRouter);

  // Setup error handling
  setupErrorHandling(app);

  // Start server
  const port = parseInt(process.env.PORT || "3000", 10);
  await app.listen(port);

  console.log(`Server running on port ${port}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
```

## Configuration Management

### Environment-Based Config

```typescript
// subatom.config.ts
const isProd = process.env.NODE_ENV === "production";
const isDev = process.env.NODE_ENV === "development";

export default {
  entry: "src/index.ts",
  outDir: "dist",
  port: parseInt(process.env.PORT || "3000", 10),
  host: isProd ? "0.0.0.0" : "localhost",
  sourcemap: isDev,
  minify: isProd,
};
```

### Secrets Management

```typescript
// src/config/secrets.ts
function getRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const secrets = {
  databaseUrl: getRequired("DATABASE_URL"),
  jwtSecret: getRequired("JWT_SECRET"),
  apiKey: getRequired("API_KEY"),
};

// Validate at startup
if (!secrets.databaseUrl || !secrets.jwtSecret) {
  throw new Error("Required secrets not configured");
}
```

## Middleware Setup

### Logging

```typescript
// src/middleware/index.ts
import { Subatom } from "subatom";

interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userAgent: string;
  ip: string;
}

export default function setupMiddleware(app: Subatom) {
  // Logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const originalEnd = res.raw.end;

    res.raw.end = function (...args: unknown[]) {
      const duration = Date.now() - start;
      const log: RequestLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get("user-agent") || "unknown",
        ip: req.ip,
      };

      // Log to stdout (suitable for container logging)
      console.log(JSON.stringify(log));

      return originalEnd.apply(res.raw, args);
    };

    next();
  });

  // CORS
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send();
      return;
    }

    next();
  });

  // Security headers
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("X-XSS-Protection", "1; mode=block");
    next();
  });

  // Rate limiting
  const rateLimitStore = new Map<string, number[]>();
  app.use((req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowMs = 60 * 1000;  // 1 minute
    const limit = 100;

    const timestamps = rateLimitStore.get(key) || [];
    const recent = timestamps.filter((t) => t > now - windowMs);

    if (recent.length >= limit) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    recent.push(now);
    rateLimitStore.set(key, recent);
    next();
  });
}
```

### Error Handling

```typescript
// src/errors/index.ts
import { Subatom, SubatomError, UnprocessableEntityError } from "subatom";

export default function setupErrorHandling(app: Subatom) {
  const isDev = process.env.NODE_ENV === "development";

  // Validation errors
  app.useError((err, req, res, next) => {
    if (err instanceof UnprocessableEntityError) {
      res.status(422).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        ...(isDev && { details: err.details }),
      });
      return;
    }
    next(err);
  });

  // Operational errors
  app.useError((err, req, res, next) => {
    if (err instanceof SubatomError) {
      res.status(err.statusCode || 500).json({
        error: err.message,
        code: err.errorCode,
      });
      return;
    }
    next(err);
  });

  // Unhandled errors
  app.useError((err, req, res) => {
    // Log for debugging
    console.error("Unhandled error:", {
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip,
      },
    });

    res.status(500).json({
      error: isDev ? err.message : "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
  });
}
```

## Graceful Shutdown

### Signal Handling

```typescript
// src/index.ts
const app = new Subatom();

// ... setup code ...

const server = await app.listen(3000);

// Graceful shutdown handlers
const signals = ["SIGTERM", "SIGINT"];

for (const signal of signals) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down gracefully...`);
    try {
      await app.gracefulShutdown(0);
      console.log("Server shut down successfully");
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  });
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason: unknown) => {
  console.error("Unhandled Rejection:", reason);
  // Gracefully shut down
  app.gracefulShutdown(1).catch(() => process.exit(1));
});
```

## Performance Optimization

### Request Limits

```typescript
app.setConfig({
  // Limit concurrent requests
  maxConcurrentRequests: 1000,

  // Request body size limits
  maxRequestSize: "100kb",

  // Timeouts
  requestTimeout: 30000,    // 30 seconds
  socketTimeout: 120000,    // 2 minutes
});
```

### Caching Headers

```typescript
app.use((req, res, next) => {
  // Cache static assets
  if (req.path.startsWith("/static/")) {
    res.set("Cache-Control", "public, max-age=31536000");  // 1 year
  }
  // Don't cache API responses
  else if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  next();
});
```

### Compression

Use gzip compression for responses (typically via reverse proxy):

```typescript
// In nginx/Apache config
ngx_http_gzip_module {
  gzip on;
  gzip_types text/plain text/css application/json application/javascript;
  gzip_min_length 1000;
  gzip_disable "msie6";
}
```

## Monitoring & Observability

### Health Check Endpoint

```typescript
// src/routes/health.ts
import { Router } from "subatom";

const router = new Router();

router.get("/", {
  controller: (ctx) => {
    ctx.res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    });
  },
});

router.get("/ready", {
  controller: async (ctx) => {
    // Check dependencies (database, cache, etc.)
    try {
      await checkDatabaseConnection();
      ctx.res.json({ ready: true });
    } catch (err) {
      ctx.res.status(503).json({ ready: false, error: err.message });
    }
  },
});

export default router;
```

### Metrics Endpoint

```typescript
router.get("/metrics", {
  middleware: [requireAdmin],  // Protect metrics
  controller: (ctx) => {
    ctx.res.json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeRequests: getActiveRequestCount(),
      totalRequests: getTotalRequestCount(),
    });
  },
});
```

## Security Best Practices

### Input Validation

```typescript
app.post("/users", {
  schema: {
    body: infer.object({
      email: infer.string().email().max(255),
      password: infer.string().min(8).max(128),
      name: infer.string().min(1).max(255),
    }),
  },
  controller: (ctx) => {
    // Input is validated and type-safe
  },
});
```

### Authentication

```typescript
const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "No token provided" });
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

app.use("/api/protected", requireAuth);
```

### SQL Injection Prevention

```typescript
// Use parameterized queries
const user = await db.query(
  "SELECT * FROM users WHERE id = $1",
  [ctx.params.id]  // Parameter passed separately
);

// Don't do this:
// const user = await db.query(`SELECT * FROM users WHERE id = ${ctx.params.id}`);
```

### CSRF Protection

```typescript
app.use((req, res, next) => {
  // Require CSRF token for state-changing requests
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    const token = req.headers["x-csrf-token"] || req.body?.csrfToken;
    if (!token || !verifyCsrfToken(token)) {
      res.status(403).json({ error: "Invalid CSRF token" });
      return;
    }
  }
  next();
});
```

## Deployment

### Docker

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

```bash
# .env.production
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://...
JWT_SECRET=...
API_KEY=...
```

### Docker Compose

```yaml
# docker-compose.yml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://db:5432/mydb
    depends_on:
      - db
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: secret
```

## Monitoring

### Application Monitoring

```typescript
// src/monitoring/index.ts
export interface AppMetrics {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  requests: {
    total: number;
    active: number;
    failed: number;
  };
}

class MetricsCollector {
  private activeRequests = 0;
  private totalRequests = 0;
  private failedRequests = 0;

  recordRequest() {
    this.totalRequests++;
    this.activeRequests++;
  }

  recordComplete() {
    this.activeRequests--;
  }

  recordError() {
    this.failedRequests++;
  }

  getMetrics(): AppMetrics {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      requests: {
        total: this.totalRequests,
        active: this.activeRequests,
        failed: this.failedRequests,
      },
    };
  }
}

export const metrics = new MetricsCollector();
```

## Common Pitfalls

### ❌ No Graceful Shutdown

```typescript
// Wrong: SIGTERM kills process immediately
await app.listen(3000);
// Handle SIGTERM missed!

// Correct
await app.listen(3000);
process.on("SIGTERM", () => app.gracefulShutdown());
```

### ❌ Logging to Console in Production

```typescript
// Wrong: Just console.log()
console.log(err);

// Correct: Structured logging
console.error(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: "error",
  error: err.message,
}));
```

### ❌ No Error Handling

```typescript
// Wrong
await db.query(sql);  // Throws unhandled error

// Correct
try {
  await db.query(sql);
} catch (err) {
  throw new SubatomError("Database error", { statusCode: 503 });
}
```

## Next Steps

- Implement [Configuration](./configuration.md) management
- Set up [Error Handling](./error-handling.md)
- Configure [Middleware](./middleware.md) stack
- Read [Deployment Guide](./deployment.md)
