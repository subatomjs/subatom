# Subatom Enterprise Deployment Guide

This guide covers production deployment patterns for Subatom applications with TLS, load balancing, distributed sessions, and multi-process orchestration.

## Single-Process Production Deployment

### Node.js HTTP Server (HTTP/2 via TLS Reverse Proxy)

```typescript
import { Subatom } from "subatom";
import { session } from "subatom";

const app = new Subatom();

// Configure Redis sessions (required in production)
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    // Redis auto-detection: reads REDIS_URL from environment
    // No need to configure the store explicitly
  })
);

app.get("/", (req, res) => res.json({ ok: true }));

const server = new (await import("subatom")).SubatomServer(app.router);
await server.start({
  port: process.env.PORT || 3000,
  // Admission control: shed load at configured concurrency
  maxConcurrentRequests: 500,
});
```

### Environment Configuration

```bash
# Required for distributed sessions
export REDIS_URL="redis://localhost:6379/0"

# Server configuration
export NODE_ENV=production
export PORT=3000
export SESSION_SECRET=$(openssl rand -hex 32)
```

### Docker Deployment

```dockerfile
FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/start/cli.js"]
```

**Docker Compose with Redis:**

```yaml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      REDIS_URL: redis://redis:6379/0
      SESSION_SECRET: ${SESSION_SECRET}
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

## Load Balancing and Multi-Process Orchestration

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: subatom-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: subatom-api
  template:
    metadata:
      labels:
        app: subatom-api
    spec:
      containers:
      - name: subatom
        image: my-registry/subatom-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: redis-url
        - name: SESSION_SECRET
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: session-secret
        - name: PORT
          value: "3000"
        - name: MAX_CONCURRENT_REQUESTS
          value: "500"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"

---
apiVersion: v1
kind: Service
metadata:
  name: subatom-api
spec:
  selector:
    app: subatom-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

### Health Check Endpoint

```typescript
import { Subatom } from "subatom";

const app = new Subatom();

// Expose health and readiness endpoints
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", (req, res) => {
  // Check dependencies (Redis, etc.)
  const ready = checkRedisConnection() && checkDatabaseConnection();
  res.status(ready ? 200 : 503).json({ ready });
});

app.get("/metrics", (req, res) => {
  // Return server metrics for monitoring
  const metrics = app.server.getMetrics();
  res.json(metrics);
});
```

## TLS Termination

TLS termination is handled by the reverse proxy layer, not the Node.js application.

### NGINX Configuration

```nginx
upstream subatom_backend {
    server app:3000;
    server app:3001;
    server app:3002;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/ssl/certs/api.example.com.crt;
    ssl_certificate_key /etc/ssl/private/api.example.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://subatom_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}

server {
    listen 80;
    server_name api.example.com;
    return 301 https://$server_name$request_uri;
}
```

### Caddy Configuration

```caddy
api.example.com {
    reverse_proxy localhost:3000
}
```

## Streaming Large Payloads

For file uploads, video streams, or large JSON payloads, use the streaming middleware:

```typescript
import { Subatom, streaming } from "subatom";
import fs from "node:fs";

const app = new Subatom();

app.post("/upload", streaming(), async (req, res) => {
  if (!req.bodyStream) {
    res.status(400).json({ error: "Stream unavailable" });
    return;
  }

  const uploadPath = `/uploads/${Date.now()}.bin`;
  req.bodyStream.pipe(fs.createWriteStream(uploadPath));

  req.bodyStream.on("error", (err) => {
    console.error("Upload stream error:", err);
    res.status(400).json({ error: "Stream error" });
  });

  req.bodyStream.on("end", () => {
    res.json({ uploaded: uploadPath });
  });
});
```

The streaming middleware avoids buffering large payloads in memory.

## Distributed Sessions

### Redis Setup

**Via Docker:**

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Via AWS ElastiCache:**

```typescript
const app = new Subatom();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    // Auto-detection: uses REDIS_URL environment variable
    // Set REDIS_URL to your ElastiCache endpoint
  })
);
```

**Via Node.js redis module:**

```bash
npm install redis
export REDIS_URL="redis://:password@elasticache-endpoint.cache.amazonaws.com:6379/0"
```

### Session Persistence Across Deployments

With Redis configured, session data persists across:

- Process restarts
- Rolling deployments
- Horizontal scaling (multiple processes/containers)
- Server failures (Redis replication)

## Admission Control and Load Shedding

The `maxConcurrentRequests` option sheds load by returning 503 when concurrency limits are exceeded:

```typescript
const server = new SubatomServer(app.router);
await server.start({
  port: 3000,
  maxConcurrentRequests: 500, // Return 503 if exceeded
});

// Monitor metrics
setInterval(() => {
  const metrics = server.getMetrics();
  console.log("Active requests:", metrics.activeRequests);
  console.log("Total requests:", metrics.totalRequests);
  console.log("Failed requests:", metrics.failedRequests);
}, 10_000);
```

## Graceful Shutdown

```typescript
import { Subatom } from "subatom";

const app = new Subatom();
const server = new (await import("subatom")).SubatomServer(app.router);

await server.start({ port: 3000 });

const gracefulShutdown = async () => {
  console.log("Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
```

## Monitoring and Observability

### Health and Metrics Endpoints

```typescript
app.get("/health", (req, res) => {
  const health = server.getHealth();
  res.status(health.healthy ? 200 : 503).json(health);
});

app.get("/metrics", (req, res) => {
  res.json(server.getMetrics());
});
```

### Request Tracing

Subatom automatically tracks request IDs and timing:

```typescript
app.get("/traced", (req, res) => {
  // req.id is auto-generated for each request
  console.log(`[${req.id}] Request received`);
  res.json({ id: req.id });
});
```

## Summary

Subatom is designed to work seamlessly with standard deployment infrastructure:

- **Single-process:** Expose via HTTP on a port, proxy through NGINX/Caddy for TLS
- **Multi-process:** Use containers (Docker), Kubernetes, or process managers
- **Sessions:** Auto-detect Redis via `REDIS_URL`, no manual store configuration needed
- **Load shedding:** Configure `maxConcurrentRequests` for admission control
- **Streaming:** Use the `streaming()` middleware for large payloads
- **Monitoring:** Expose `/health` and `/metrics` endpoints for observability

This model integrates naturally with any container orchestration platform, load balancer, or cloud provider.
