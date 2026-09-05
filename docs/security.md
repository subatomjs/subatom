# Security

Production-ready security patterns and implementations for Subatom applications.

## Authentication

### JWT Authentication

```typescript
// src/auth/jwt.ts
import jwt from "jsonwebtoken";
import { SubatomError } from "subatom";

const SECRET = process.env.JWT_SECRET || "dev-secret";

interface TokenPayload {
  id: string;
  email: string;
  role: "user" | "admin";
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, {
    expiresIn: "24h",
    algorithm: "HS256",
  });
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, SECRET, {
      algorithms: ["HS256"],
    }) as TokenPayload;
  } catch (err) {
    throw new SubatomError("Invalid token", {
      statusCode: 401,
      errorCode: "INVALID_TOKEN",
    });
  }
}

export function refreshToken(token: string): string {
  const payload = verifyToken(token);
  return signToken(payload);
}
```

### Middleware

```typescript
// src/middleware/auth.ts
import { verifyToken, signToken } from "../auth/jwt";
import { Subatom } from "subatom";

export const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const requireRole = (roles: string[]) => {
  return async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
};
```

### Login Route

```typescript
// src/routes/auth.ts
import { Router } from "subatom";
import infer from "subatom-infer";
import { signToken, verifyToken } from "../auth/jwt";
import { hash, verify } from "../services/password";

const router = new Router();

router.post("/login", {
  schema: {
    body: infer.object({
      email: infer.string().email(),
      password: infer.string(),
    }),
  },
  controller: async (ctx) => {
    const user = await findUserByEmail(ctx.body.email);

    if (!user) {
      ctx.res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const passwordValid = await verify(ctx.body.password, user.passwordHash);
    if (!passwordValid) {
      ctx.res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    ctx.res.json({ token, user: { id: user.id, email: user.email } });
  },
});

router.post("/refresh", {
  schema: {
    body: infer.object({ token: infer.string() }),
  },
  controller: async (ctx) => {
    try {
      const payload = verifyToken(ctx.body.token);
      const newToken = signToken(payload);
      ctx.res.json({ token: newToken });
    } catch (err) {
      ctx.res.status(401).json({ error: "Invalid token" });
    }
  },
});

export default router;
```

## Password Security

```typescript
// src/services/password.ts
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;  // Expensive enough to prevent brute force

export async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verify(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Usage in user creation
export async function createUser(email: string, password: string) {
  // Validate password strength
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const passwordHash = await hash(password);
  return saveUserToDB({ email, passwordHash });
}
```

## CORS Configuration

```typescript
// src/middleware/cors.ts
export const corsMiddleware = (options = {}) => {
  const allowedOrigins = [
    "https://example.com",
    "https://app.example.com",
  ];

  const origin = options.origin || allowedOrigins;

  return (req, res, next) => {
    const requestOrigin = req.headers.origin;

    if (Array.isArray(origin) && requestOrigin) {
      if (origin.includes(requestOrigin)) {
        res.set("Access-Control-Allow-Origin", requestOrigin);
      }
    } else if (typeof origin === "string") {
      res.set("Access-Control-Allow-Origin", origin);
    }

    res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-CSRF-Token"
    );
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Max-Age", "86400");  // 24 hours

    if (req.method === "OPTIONS") {
      res.status(200).send();
      return;
    }

    next();
  };
};
```

## CSRF Protection

```typescript
// src/middleware/csrf.ts
import crypto from "crypto";

const sessions = new Map<string, string>();

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyCsrfToken(token: string, sessionId: string): boolean {
  const stored = sessions.get(sessionId);
  return stored === token;
}

export const csrfMiddleware = (req, res, next) => {
  // Skip CSRF for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  // Verify CSRF token
  const token = req.headers["x-csrf-token"] || req.body?.csrfToken;
  const sessionId = req.session?.id;

  if (!token || !verifyCsrfToken(token, sessionId)) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }

  next();
};

// Route to get CSRF token
export const getCsrfToken = (req, res) => {
  const sessionId = req.session?.id || crypto.randomUUID();
  const token = generateCsrfToken();
  sessions.set(sessionId, token);
  res.json({ token });
};
```

## Security Headers

```typescript
// src/middleware/security-headers.ts
export const securityHeadersMiddleware = (req, res, next) => {
  // Prevent MIME type sniffing
  res.set("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  res.set("X-Frame-Options", "DENY");

  // Enable XSS protection (older browsers)
  res.set("X-XSS-Protection", "1; mode=block");

  // Strict Transport Security
  if (process.env.NODE_ENV === "production") {
    res.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  // Content Security Policy
  res.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );

  // Referrer Policy
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy
  res.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );

  next();
};
```

## Input Validation & Sanitization

```typescript
// src/middleware/validation.ts
import infer from "subatom-infer";

// subatom-infer schema with sanitization
const userInputSchema = infer.object({
  email: infer.string().email().max(255),
  name: infer.string().min(1).max(255).trim(),
  bio: infer.string().max(1000).trim().optional(),
});

// Safe object merge
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (result.hasOwnProperty(key)) {
      result[key] = source[key];
    }
  }
  return result;
}

// Prevent prototype pollution
export function sanitizeInput(data: any): any {
  const dangerousKeys = ["__proto__", "constructor", "prototype"];
  for (const key of dangerousKeys) {
    delete data[key];
  }
  return data;
}

export const validationMiddleware = (req, res, next) => {
  try {
    const sanitized = sanitizeInput(req.body);
    const validated = userInputSchema.parse(sanitized);
    req.body = validated;
    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid input" });
  }
};
```

## SQL Injection Prevention

```typescript
// WRONG: SQL injection vulnerability
const username = req.body.username;
const query = `SELECT * FROM users WHERE username = '${username}'`;
await db.query(query);

// CORRECT: Parameterized queries
const query = "SELECT * FROM users WHERE username = $1";
await db.query(query, [username]);
```

## Rate Limiting

```typescript
// src/middleware/rate-limit.ts
interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

export function rateLimit(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;  // 1 minute
  const maxRequests = options.max || 100;
  const keyGenerator = options.keyGenerator || ((req) => req.ip);

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    if (!store[key]) {
      store[key] = { count: 0, resetTime: now + windowMs };
    }

    const entry = store[key];

    // Reset if window expired
    if (now > entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }

    entry.count++;

    res.set("X-RateLimit-Limit", String(maxRequests));
    res.set("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));

    if (entry.count > maxRequests) {
      res.status(429).json({
        error: "Too many requests",
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
}
```

## API Key Authentication

```typescript
// src/auth/api-key.ts
const validApiKeys = new Map<string, { name: string; permissions: string[] }>();

export function registerApiKey(
  key: string,
  name: string,
  permissions: string[] = []
) {
  validApiKeys.set(key, { name, permissions });
}

export const requireApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    res.status(401).json({ error: "API key required" });
    return;
  }

  const keyInfo = validApiKeys.get(apiKey);
  if (!keyInfo) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.apiKey = keyInfo;
  next();
};

export const requirePermission = (permission: string) => {
  return (req, res, next) => {
    if (!req.apiKey?.permissions.includes(permission)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
};
```

## Logging Security Events

```typescript
// src/services/audit.ts
interface AuditLog {
  timestamp: string;
  event: string;
  userId?: string;
  resource?: string;
  action: string;
  status: "success" | "failure";
  details?: Record<string, any>;
  ip: string;
}

const auditLogs: AuditLog[] = [];

export async function logAuditEvent(log: Omit<AuditLog, "timestamp">) {
  const entry: AuditLog = {
    ...log,
    timestamp: new Date().toISOString(),
  };

  auditLogs.push(entry);

  // In production, write to database or external service
  if (log.status === "failure") {
    console.warn("Security event:", JSON.stringify(entry));
  }
}

// Usage
export const auditMiddleware = (req, res, next) => {
  const originalEnd = res.raw.end;

  res.raw.end = async function (...args: unknown[]) {
    if (res.statusCode >= 400) {
      await logAuditEvent({
        event: "http_error",
        userId: req.user?.id,
        resource: req.path,
        action: req.method,
        status: "failure",
        details: { statusCode: res.statusCode },
        ip: req.ip,
      });
    }
    return originalEnd.apply(res.raw, args);
  };

  next();
};
```

## Environment-Based Security

```typescript
// src/middleware/security.ts
export function setupSecurityMiddleware(app: Subatom) {
  const isDev = process.env.NODE_ENV === "development";
  const isProd = process.env.NODE_ENV === "production";

  // Only enable in production
  if (isProd) {
    app.use(securityHeadersMiddleware);
    app.use(csrfMiddleware);
    app.use(corsMiddleware({
      origin: process.env.ALLOWED_ORIGINS?.split(",") || [],
    }));
  }

  // Enable in all environments
  app.use(validationMiddleware);
  app.use(rateLimit({ max: 100 }));
  app.use(auditMiddleware);

  // Verbose logging in dev
  if (isDev) {
    app.use((req, res, next) => {
      console.log(`[${req.method}] ${req.path}`);
      next();
    });
  }
}
```

## Best Practices

### 1. Environment Variables for Secrets

```bash
# .env.production
JWT_SECRET=<strong-random-string>
API_KEY=<strong-random-string>
DATABASE_PASSWORD=<strong-random-string>
```

### 2. Least Privilege

```typescript
// Grant minimal permissions
export const requirePermission = (requiredRoles: string[]) => {
  return (req, res, next) => {
    if (!requiredRoles.includes(req.user?.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
};

app.delete("/users/:id", {
  middleware: [requireAuth, requirePermission(["admin"])],
  controller: async (ctx) => {
    // Only admins can delete users
  },
});
```

### 3. Input Size Limits

```typescript
app.setConfig({
  maxRequestSize: "100kb",
  maxHeaderSize: 16384,
});
```

### 4. Sensitive Data Handling

```typescript
// Never log passwords
const { password, ...safeUser } = user;
console.log(safeUser);

// Never send sensitive data in URLs
// Wrong: /api/users?apiKey=secret
// Correct: Authorization: Bearer secret
```

## Common Pitfalls

### ❌ Weak Passwords

```typescript
// Wrong: Accept any password
if (!password) throw new Error("Password required");

// Correct: Enforce strong passwords
if (password.length < 12) {
  throw new Error("Password must be at least 12 characters");
}
if (!/[A-Z]/.test(password)) {
  throw new Error("Password must contain uppercase");
}
if (!/[0-9]/.test(password)) {
  throw new Error("Password must contain numbers");
}
```

### ❌ Hardcoded Secrets

```typescript
// Wrong
const JWT_SECRET = "super-secret-key";

// Correct
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET not set");
```

### ❌ No HTTPS in Production

```typescript
// Wrong: Not enforcing HTTPS
if (req.protocol !== "https") {
  // Potentially vulnerable
}

// Correct: Force HTTPS
if (process.env.NODE_ENV === "production" && req.protocol !== "https") {
  res.redirect(301, `https://${req.host}${req.url}`);
  return;
}
```

## Next Steps

- Implement [Authentication & Authorization](./authentication.md)
- Configure [Middleware](./middleware.md) for security
- Read [Best Practices](./best-practices.md)
- Explore [OWASP Top 10](https://owasp.org/www-project-top-ten/)
