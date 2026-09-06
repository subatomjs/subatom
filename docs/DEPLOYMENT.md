# Deployment

This guide covers production deployment for a Subatom application using the public server, middleware, and configuration APIs.

## Production Configuration

Create `subatom.config.ts` in the application root when you need shared server settings:

```typescript
export default {
  entry: "src/index.ts",
  outDir: "dist",
  port: 3000,
  host: "0.0.0.0",
  sourcemap: true,
  minify: false,
};
```

Supported configuration keys are `entry`, `outDir`, `port`, `host`, `sourcemap`, `minify`, and `watch`. The `watch` object supports `extensions`, `debounceMs`, and `ignore`.

Build the application with:

```bash
npm run build
```

The CLI also provides `subatom build`, `subatom start`, `subatom preview`, and `subatom dev` commands when the package binary is installed.

## Starting the Server

Use `listen()` for a direct HTTP server start. Its signature is `listen(port = 8080, host?, appName?)`:

```typescript
import { Subatom } from "subatom";

const app = new Subatom();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const server = app.listen(3000, "0.0.0.0", "subatom-api");

process.once("SIGTERM", () => {
  server.close(() => process.exit(0));
});
```

Use `start()` when configuration should be resolved from the application configuration and optional overrides:

```typescript
import { Subatom } from "subatom";

const app = new Subatom();
app.get("/health", (_req, res) => res.json({ status: "ok" }));

await app.start({
  port: 3000,
  host: "0.0.0.0",
  maxConcurrentRequests: 500,
});
```

`maxConcurrentRequests` limits accepted concurrent requests. Requests above the limit receive HTTP 503 with a `Retry-After` header.

The server configuration also supports `appName`, `shutdownTimeoutMs`, `headersTimeout`, `requestTimeout`, `keepAliveTimeout`, and `maxConnections`.

## Docker

```dockerfile
FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/start/cli.js", "start"]
```

Pass production settings through environment variables or `subatom.config.ts`. The framework does not automatically convert arbitrary environment variables into server configuration values.

## Reverse Proxy and TLS

Terminate TLS at a reverse proxy such as NGINX or Caddy and forward HTTP traffic to the Subatom listener. Configure the application host as `0.0.0.0` when it must accept traffic from outside the container or host:

```nginx
upstream subatom_backend {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate /etc/ssl/certs/api.example.com.crt;
    ssl_certificate_key /etc/ssl/private/api.example.com.key;

    location / {
        proxy_pass http://subatom_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Streaming Request Bodies

Use the exported `streaming()` middleware for accepted content types such as binary, audio, video, and multipart requests:

```typescript
import { createWriteStream } from "node:fs";
import { Subatom, streaming } from "subatom";

const app = new Subatom();

app.post("/upload", streaming(), (req, res, next) => {
  const stream = req.bodyStream;
  if (!stream) {
    res.status(400).json({ error: "Stream unavailable" });
    return;
  }

  stream.on("error", next);
  stream.pipe(createWriteStream("./upload.bin"));
  stream.on("end", () => res.json({ uploaded: true }));
});
```

The middleware accepts `chunkSizeKb`, `acceptTypes`, and `onStreamError` options. It attaches the raw request stream as `req.bodyStream` only when the request content type matches one of the configured patterns.

## Sessions

The session middleware requires a secret:

```typescript
import { Subatom, session } from "subatom";

const app = new Subatom();

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "development-only-secret",
  }),
);
```

In production, configure `REDIS_URL` for the Redis session store, pass a custom `store`, or explicitly set `allowInMemoryInProduction: true`. Do not rely on the in-memory store for distributed deployments.

## Health Checks

Expose a lightweight endpoint for a load balancer or container probe:

```typescript
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
```

Keep dependency checks separate from the liveness endpoint when a temporary dependency failure should not cause the process to be restarted.

## Graceful Shutdown

The `Subatom` application registers process-boundary handling and exposes `gracefulShutdown(exitCode?)`. Use it for application-owned shutdown hooks:

```typescript
process.once("SIGTERM", () => {
  app.gracefulShutdown(0);
});
```

The public `SubatomServer` class also supports `start(config?)`, `close(callback)`, `getMetrics()`, and `getHealth()` when you construct it directly with a router and middleware arrays. For normal applications, prefer `Subatom.start()` or `Subatom.listen()` so the application-owned router and middleware are configured consistently.
