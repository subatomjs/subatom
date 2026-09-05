# Context: Request & Response Facades

The `Context` object combines `Request` and `Response` into a single, type-safe interface for route handlers. It provides convenient facades for accessing request data and sending responses.

## Overview

`Context` is the primary interface developers interact with in route handlers. It provides:
- Type-safe access to request data (body, params, query, headers, files)
- User and locals storage for sharing data through middleware
- Convenient response methods (json, send, html, redirect, etc.)
- Session management
- Cookie access and manipulation

## Creating Context

Context is automatically created for each request and passed to route handlers:

```typescript
app.get("/users/:id", {
  controller: (ctx) => {
    // ctx is Context<unknown, Record<string, unknown>, unknown>
    // Fully typed when you provide a schema
  },
});
```

With a typed schema:

```typescript
app.get<UserSchema, UserLocals, User>("/users/:id", {
  schema: { /* validation rules */ },
  controller: (ctx) => {
    // ctx is Context<UserSchema, UserLocals, User>
    // All properties are properly typed
  },
});
```

## Type Parameters

```typescript
class Context<
  TSchema = unknown,
  TLocals extends Record<string, unknown> = Record<string, unknown>,
  TUser = unknown,
>
```

| Parameter | Description |
|-----------|-------------|
| `TSchema` | Route schema with body, query, params, headers, files |
| `TLocals` | Type of `ctx.locals` object for sharing data |
| `TUser` | Type of `ctx.user` object after authentication |

## Request Data Facades

### params

```typescript
public get params(): InferParams<TSchema>
```

URL path parameters extracted from dynamic segments.

**Example:**
```typescript
app.get("/users/:id/posts/:postId", {
  controller: (ctx) => {
    const userId = ctx.params.id;        // "123"
    const postId = ctx.params.postId;    // "456"
    ctx.res.json({ userId, postId });
  },
});
```

**With typed schema:**
```typescript
const routeSchema = {
  params: infer.object({
    id: infer.string().uuid(),
    postId: infer.string().uuid(),
  }),
};

app.get<typeof routeSchema>("/users/:id/posts/:postId", {
  schema: routeSchema,
  controller: (ctx: IContext) => {
    // ctx.params.id is typed as string
    // ctx.params.postId is typed as string
  },
});
```

### query

```typescript
public get query(): InferQuery<TSchema>
```

Query string parameters from the URL search string.

**Example:**
```typescript
app.get("/search", {
  controller: (ctx) => {
    const q = ctx.query.q;        // "typescript"
    const page = ctx.query.page;  // "1"
    ctx.res.json({ q, page });
  },
});

// Request: GET /search?q=typescript&page=1
```

**With type validation:**
```typescript
const searchSchema = {
  query: infer.object({
    q: infer.string(),
    page: infer.number().int().optional(),
  }),
};

app.get<typeof searchSchema>("/search", {
  schema: searchSchema,
  controller: (ctx: IContext) => {
    // ctx.query.q is string
    // ctx.query.page is number | undefined
  },
});
```

### body

```typescript
public get body(): InferBody<TSchema>
```

Parsed request body (JSON, form data, etc.).

**Example:**
```typescript
app.post("/users", {
  schema: {
    body: infer.object({
      name: infer.string(),
      email: infer.string().email(),
      age: infer.number().min(18),
    }),
  },
  controller: (ctx) => {
    const { name, email, age } = ctx.body;
    // name is typed as string
    // email is typed as string
    // age is typed as number
    ctx.res.status(201).json({ id: "1", ...ctx.body });
  },
});

// Request: POST /users
// Content-Type: application/json
// {"name": "John", "email": "john@example.com", "age": 30}
```

### headers

```typescript
public get headers(): InferHeaders<TSchema>
```

HTTP request headers.

**Example:**
```typescript
app.get("/protected", {
  controller: (ctx) => {
    const auth = ctx.headers.authorization;
    const userAgent = ctx.headers["user-agent"];
    ctx.res.json({ authorized: !!auth });
  },
});
```

**With typed schema:**
```typescript
interface AuthRoute {
  headers: Record<string, unknown>;
}

app.get<AuthRoute>("/protected", {
  schema: {
    headers: infer.object({
      authorization: infer.string(),
    }),
  },
  controller: (ctx) => {
    // ctx.headers.authorization is guaranteed to exist
  },
});
```

### cookies

```typescript
public get cookies(): Record<string, string>
```

Parsed HTTP cookies.

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    const sessionId = ctx.cookies.sessionId;
    const theme = ctx.cookies.theme;
    ctx.res.json({ sessionId, theme });
  },
});
```

### files and file

```typescript
public get files(): InferFiles<TSchema>
public get file(): InferFile<TSchema>
```

Uploaded files from multipart form data.

**Single files:**
```typescript
app.post("/avatar", {
  schema: {
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    const upload = ctx.files.file;  // IFileUpload
    const buffer = await upload.buffer();
    const stream = upload.stream();
    await upload.destroy();  // Cleanup
  },
});
```

**Multiple files:**
```typescript
app.post("/photos", {
  schema: {
    files: infer.files().max(10),
  },
  controller: async (ctx) => {
    const uploads = ctx.files.files;  // Record<string, IFileUpload[]>
    for (const upload of uploads.photos) {
      const data = await upload.buffer();
      await processImage(data);
      await upload.destroy();
    }
  },
});
```

### user

```typescript
public get user(): TUser
public set user(value: TUser)
```

Authenticated user object (set by authentication middleware).

**Example:**
```typescript
interface AuthLocals {
  userId: string;
}

interface UserCtx {
  locals: AuthLocals;
}

app.use(async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    const decoded = await verifyJWT(token);
    req.user = decoded;
  }
  next();
});

app.get("/me", {
  controller: (ctx) => {
    if (!ctx.user) {
      ctx.res.status(401).json({ error: "Not authenticated" });
      return;
    }
    ctx.res.json(ctx.user);
  },
});
```

### locals

```typescript
public get locals(): TLocals
public set locals(value: TLocals)
```

Request-local storage for sharing data between middleware and handlers.

**Example:**
```typescript
interface RequestLocals {
  org: Organization;
  userId: string;
  roles: string[];
}

// Middleware populates locals
app.use(async (req, res, next) => {
  const org = await fetchOrganization(req.headers["x-org-id"]);
  req.locals = { org, userId: req.user?.id };
  next();
});

// Handler uses locals
app.get<{}, RequestLocals>("/org/settings", {
  controller: (ctx) => {
    const org = ctx.locals.org;
    const userId = ctx.locals.userId;
    ctx.res.json({ org, userId });
  },
});
```

## Request Properties

### Request Information

```typescript
public get ip(): string
public get method(): string
public get path(): string
public get url(): string
public get protocol(): "http" | "https"
public get secure(): boolean
public get host(): string
public get hostname(): string
```

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    ctx.res.json({
      ip: ctx.ip,            // "192.168.1.1"
      method: ctx.method,    // "GET"
      path: ctx.path,        // "/api/users"
      url: ctx.url,          // "/api/users?page=1"
      protocol: ctx.protocol, // "https"
      secure: ctx.secure,    // true
      host: ctx.host,        // "example.com:3000"
      hostname: ctx.hostname, // "example.com"
    });
  },
});
```

### Session

```typescript
public get session(): ISession
public get sessionID(): string
```

Session data (when session middleware is enabled).

**Example:**
```typescript
app.use(sessionMiddleware());

app.get("/", {
  controller: (ctx) => {
    ctx.session.userId = "123";
    ctx.session.role = "admin";
    ctx.res.json({ sessionID: ctx.sessionID });
  },
});
```

### Aliases

```typescript
public get request(): IRequest  // Alias for ctx.req
public get response(): IResponse // Alias for ctx.res
```

## Request Methods

### get(headerName)

```typescript
public get(headerName: string): string | undefined
```

Get a single header value.

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    const contentType = ctx.get("content-type");
    const userAgent = ctx.get("user-agent");
    ctx.res.json({ contentType, userAgent });
  },
});
```

### accepts(types)

```typescript
public accepts(type: string): boolean
public accepts(...types: string[]): string | false
public accepts(types: string[]): string | false
```

Check if request accepts specific content types.

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    if (ctx.accepts("json")) {
      ctx.res.json({ data: "json" });
    } else if (ctx.accepts("html")) {
      ctx.res.html("<h1>HTML</h1>");
    } else {
      ctx.res.send("plain text");
    }
  },
});
```

## Response State

### State Inspection

```typescript
public get headersSent(): boolean
public get writableEnded(): boolean
public get statusCode(): number
```

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    console.log(ctx.headersSent);   // false
    ctx.res.json({ data: "value" });
    console.log(ctx.headersSent);   // true
  },
});
```

## Response Methods

### Status

```typescript
public status(code: number): this
```

Set HTTP status code.

**Example:**
```typescript
app.post("/users", {
  controller: (ctx) => {
    ctx.status(201).json({ id: "1", name: "John" });
  },
});
```

### Content Type

```typescript
public type(contentType: string): this
public contentType(contentType: string): this
```

Set Content-Type header.

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    ctx.type("text/plain").send("Hello");
    // or
    ctx.contentType("application/json").json({ ok: true });
  },
});
```

### JSON Response

```typescript
public json(data: unknown): this
```

Send JSON response with `Content-Type: application/json`.

**Example:**
```typescript
app.get("/users", {
  controller: (ctx) => {
    ctx.json({ users: [] });
  },
});
```

### HTML Response

```typescript
public html(htmlContent: string): this
```

Send HTML response with `Content-Type: text/html`.

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    ctx.html("<h1>Welcome</h1><p>Hello World</p>");
  },
});
```

### Send Response

```typescript
public send(body?: string | Buffer | Uint8Array | object): void
```

Send response body (infers content-type).

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    ctx.send("plain text");
    ctx.send(Buffer.from("binary"));
    ctx.send({ json: "object" });
  },
});
```

### Redirect

```typescript
public redirect(statusOrUrl: number | string, url?: string): void
```

Send redirect response.

**Example:**
```typescript
app.get("/old-path", {
  controller: (ctx) => {
    ctx.redirect("/new-path");
    // or with status code
    ctx.redirect(301, "/permanently-moved");
  },
});
```

### Download

```typescript
public download(filePath: string, filename?: string): void
```

Send file as download attachment.

**Example:**
```typescript
app.get("/export", {
  controller: (ctx) => {
    ctx.download("/tmp/export.csv", "data.csv");
  },
});
```

### Send File

```typescript
public sendFile(filePath: string, options?: SendFileOptions): void
```

Send file with optional streaming and range support.

**Example:**
```typescript
app.get("/document/:id", {
  controller: (ctx) => {
    ctx.sendFile(`/documents/${ctx.params.id}.pdf`);
  },
});
```

### Streaming

```typescript
public stream(readable: Readable, options?: IStreamOptions): void
public sendStream(readable: Readable, options?: ISendStreamOptions): void
public pipe(readable: Readable, options?: IPipeOptions): void
```

Stream data to response.

**Example:**
```typescript
import { createReadStream } from "fs";

app.get("/video", {
  controller: (ctx) => {
    const stream = createReadStream("/videos/movie.mp4");
    ctx.stream(stream);
  },
});
```

## Headers

### Set Headers

```typescript
public set(name: string, value: string | string[]): this
public set(headers: Record<string, string | string[]>): this
```

Set response headers.

**Example:**
```typescript
app.get("/", {
  controller: (ctx) => {
    ctx.set("X-Custom-Header", "value");
    ctx.set({
      "X-Request-ID": "abc123",
      "Cache-Control": "no-cache",
    });
  },
});
```

### Append Headers

```typescript
public append(name: string, value: string | string[]): this
```

Append to header value (useful for multi-value headers).

**Example:**
```typescript
ctx.append("Set-Cookie", "session=abc123");
ctx.append("Set-Cookie", "theme=dark");
```

### Get Header

```typescript
public get(name: string): string | string[] | undefined
```

Get header value.

**Example:**
```typescript
const etag = ctx.res.get("etag");
```

### Remove Header

```typescript
public removeHeader(name: string): this
```

Remove response header.

**Example:**
```typescript
ctx.res.removeHeader("X-Powered-By");
```

### Vary

```typescript
public vary(field: string): this
```

Add Vary header for caching.

**Example:**
```typescript
ctx.vary("Accept-Encoding");
```

## Cookies

### Set Cookie

```typescript
public cookie(name: string, value: string, options?: CookieOptions): this
```

Set HTTP cookie.

**CookieOptions:**

| Option | Type | Description |
|--------|------|-------------|
| `maxAge` | number | Max age in milliseconds |
| `expires` | Date | Expiration date |
| `path` | string | Cookie path (default: "/") |
| `domain` | string | Cookie domain |
| `secure` | boolean | HTTPS only |
| `httpOnly` | boolean | No JavaScript access |
| `sameSite` | "Strict" \| "Lax" \| "None" | CSRF protection |

**Example:**
```typescript
app.post("/login", {
  controller: (ctx) => {
    ctx.cookie("sessionId", "abc123", {
      maxAge: 24 * 60 * 60 * 1000,  // 1 day
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    });
    ctx.json({ ok: true });
  },
});
```

### Clear Cookie

```typescript
public clearCookie(name: string, options?: CookieOptions): this
```

Delete cookie.

**Example:**
```typescript
app.post("/logout", {
  controller: (ctx) => {
    ctx.clearCookie("sessionId");
    ctx.json({ ok: true });
  },
});
```

## Type Inference

Subatom automatically infers types from your schema:

```typescript
import infer from "subatom-infer";

const userRouteSchema = {
  body: infer.object({
    name: infer.string(),
    email: infer.string().email(),
  }),
  params: infer.object({ id: infer.string().uuid() }),
  query: infer.object({ includeDeleted: infer.boolean().optional() }),
  headers: infer.object({ authorization: infer.string() }),
};

interface UserLocals {
  org: Organization;
  requestId: string;
}

type AuthenticatedUser = { id: string; role: string };

app.get<typeof userRouteSchema, UserLocals, AuthenticatedUser>("/users/:id", {
  schema: userRouteSchema,
  controller: (ctx: IContext) => {
    // TypeScript knows all these types:
    ctx.params.id;           // string
    ctx.query.includeDeleted; // boolean | undefined
    ctx.headers.authorization; // string
    ctx.body.name;           // string
    ctx.locals.org;          // Organization
    ctx.user.id;             // string
    ctx.user.role;           // string
  },
});
```

## Production Best Practices

### 1. Type Your Routes

```typescript
interface GetUserRoute {
  params: Record<string, unknown>;
  response: User;
}

interface GetUserLocals {
  org: Organization;
}

app.get<GetUserRoute, GetUserLocals>("/users/:id", {
  schema: { /* ... */ },
  controller: (ctx) => {
    // Full type safety
  },
});
```

### 2. Validate Headers

```typescript
app.post("/webhook", {
  schema: {
    headers: infer.object({
      "x-signature": infer.string(),
      "content-type": infer.string("application/json"),
    }),
  },
  controller: (ctx) => {
    // Headers are validated and typed
  },
});
```

### 3. Check Response Status

```typescript
app.get("/data", {
  controller: async (ctx) => {
    if (!ctx.headersSent) {
      const data = await fetchData();
      ctx.json(data);
    }
  },
});
```

### 4. Use Locals for Context

```typescript
app.use(async (req, res, next) => {
  req.locals = {
    requestId: generateId(),
    startTime: Date.now(),
  };
  next();
});

app.get("/", {
  controller: (ctx) => {
    ctx.res.set("X-Request-ID", ctx.locals.requestId);
    ctx.json({ ok: true });
  },
});
```

## Next Steps

- Learn about [Request](./request.md) and [Response](./response.md) classes
- Implement [Validation](./validation.md) for request data
- Set up [Middleware](./middleware.md) to populate context
- Explore [Error Handling](./error-handling.md) patterns
