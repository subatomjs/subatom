# OpenAPI & API Documentation

Generate interactive API documentation with OpenAPI/Swagger from your Subatom routes.

## OpenAPI Generation Overview

Subatom provides automatic OpenAPI schema generation from route definitions and validation schemas:

- **Automatic Schema Inference** - subatom-infer schemas are converted to OpenAPI schemas
- **Interactive Swagger UI** - Browse and test your API live
- **ReDoc Support** - Beautiful API documentation alternative
- **Type-Safe** - Documentation stays in sync with code via TypeScript types
- **Extensible** - Add custom metadata, examples, and descriptions

## Setup

### Installation

```bash
npm install subatom
```

### Basic Configuration

```typescript
// src/index.ts
import { Subatom, registerDocs } from "subatom";
import infer from "subatom-infer";

const app = new Subatom();

// Register OpenAPI documentation
registerDocs(app, {
  title: "My API",
  version: "1.0.0",
  description: "API documentation",
  baseUrl: "https://api.example.com",
  servers: [
    {
      url: "https://api.example.com",
      description: "Production",
    },
    {
      url: "http://localhost:3000",
      description: "Development",
    },
  ],
});

// Access at:
// GET /docs (Swagger UI)
// GET /docs/redoc (ReDoc)
// GET /docs/openapi.json (OpenAPI spec)
```

## Route Documentation

### Basic Route with Schema

```typescript
app.get("/users/:id", {
  schema: {
    params: infer.object({
      id: infer.string().describe("User ID"),
    }),
  },
  controller: (ctx) => {
    ctx.res.json({ id: ctx.params.id, name: "John" });
  },
});
```

Generates OpenAPI:

```yaml
get:
  summary: Get User
  parameters:
    - name: id
      in: path
      required: true
      schema:
        type: string
      description: User ID
  responses:
    "200":
      description: Success
```

### Complete Documentation Example

```typescript
const userSchema = infer.object({
  id: infer.string(),
  email: infer.string().email().describe("User email address"),
  name: infer.string().describe("Full name"),
  role: infer.string(["user", "admin"]).describe("User role"),
  createdAt: infer.string().datetime().describe("Account creation date"),
});

app.post("/users", {
  schema: {
    body: infer.object({
      email: infer.string().email().describe("Email address"),
      name: infer.string().min(1).describe("Full name"),
      password: infer.string().min(8).describe("Password (min 8 chars)"),
    }),
  },
  controller: async (ctx) => {
    // Implementation
  },
});
```

## Query Parameters

```typescript
app.get("/users", {
  schema: {
    query: infer.object({
      skip: infer.number()
        .int()
        .nonnegative()
        .default(0)
        .describe("Number of records to skip"),
      take: infer.number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of records to return"),
      email: infer.string().email().optional().describe("Filter by email"),
      role: infer.enum(["user", "admin"]).optional().describe("Filter by role"),
    }),
  },
  controller: async (ctx) => {
    // Get users with filtering and pagination
  },
});
```

Generates OpenAPI:

```yaml
get:
  parameters:
    - name: skip
      in: query
      schema:
        type: integer
        minimum: 0
        default: 0
      description: Number of records to skip
    - name: take
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
      description: Number of records to return
    - name: email
      in: query
      required: false
      schema:
        type: string
        format: email
      description: Filter by email
    - name: role
      in: query
      required: false
      schema:
        type: string
        enum: [user, admin]
      description: Filter by role
```

## Response Documentation

### Custom Response Type

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

app.get("/users/:id", {
  schema: {
    params: infer.object({ id: infer.string() }),
  },
  controller: async (ctx): Promise<User> => {
    return {
      id: ctx.params.id,
      email: "user@example.com",
      name: "John Doe",
      createdAt: new Date(),
    };
  },
});
```

### Multiple Response Codes

```typescript
app.get("/users/:id", {
  schema: {
    params: infer.object({ id: infer.string() }),
  },
  controller: async (ctx) => {
    const user = await findUser(ctx.params.id);

    if (!user) {
      // 404 response
      ctx.res.status(404).json({ error: "User not found" });
      return;
    }

    // 200 response
    ctx.res.json(user);
  },
});
```

Document with custom metadata:

```typescript
app.get("/users/:id", {
  name: "getUserById",
  summary: "Get User by ID",
  description: "Retrieve a specific user by their ID",
  tags: ["Users"],
  examples: [
    {
      id: "user-123",
      email: "john@example.com",
      name: "John Doe",
    },
  ],
  schema: {
    params: infer.object({ id: infer.string() }),
  },
  controller: async (ctx) => {
    ctx.res.json(await findUser(ctx.params.id));
  },
});
```

## Error Responses

Document error cases:

```typescript
app.post("/users", {
  tags: ["Users"],
  summary: "Create User",
  schema: {
    body: infer.object({
      email: infer.string().email(),
      name: infer.string(),
    }),
  },
  controller: async (ctx) => {
    const exists = await checkUserExists(ctx.body.email);

    if (exists) {
      // 409 Conflict
      ctx.res.status(409).json({
        error: "User already exists",
        code: "USER_EXISTS",
      });
      return;
    }

    // 201 Created
    const user = await createUser(ctx.body);
    ctx.res.status(201).json(user);
  },
});
```

## Authentication Documentation

### Bearer Token

```typescript
app.get("/me", {
  summary: "Get Current User",
  description: "Requires valid JWT token",
  tags: ["Auth"],
  security: {
    bearerAuth: [],
  },
  middleware: [requireAuth],
  controller: (ctx) => {
    ctx.res.json(ctx.user);
  },
});
```

### API Key

```typescript
app.get("/admin/stats", {
  summary: "Get Statistics",
  security: {
    apiKey: [],
  },
  middleware: [requireApiKey],
  controller: (ctx) => {
    ctx.res.json({ users: 1000, posts: 5000 });
  },
});
```

Configure security schemes:

```typescript
registerDocs(app, {
  title: "My API",
  version: "1.0.0",
  security: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "JWT token in Authorization header",
    },
    apiKey: {
      type: "apiKey",
      in: "header",
      name: "X-API-Key",
      description: "API key for service-to-service auth",
    },
  },
});
```

## Tags & Organization

```typescript
const router = new Router();

// Users routes
router.get("/", {
  tags: ["Users"],
  summary: "List Users",
  controller: async (ctx) => {
    ctx.res.json(await getUsers());
  },
});

router.post("/", {
  tags: ["Users"],
  summary: "Create User",
  schema: {
    body: infer.object({ email: infer.string().email(), name: infer.string() }),
  },
  controller: async (ctx) => {
    ctx.res.status(201).json(await createUser(ctx.body));
  },
});

// Posts routes
router.get("/posts", {
  tags: ["Posts"],
  summary: "List Posts",
  controller: async (ctx) => {
    ctx.res.json(await getPosts());
  },
});

router.post("/posts", {
  tags: ["Posts"],
  summary: "Create Post",
  schema: {
    body: infer.object({ title: infer.string(), content: infer.string() }),
  },
  controller: async (ctx) => {
    ctx.res.status(201).json(await createPost(ctx.body));
  },
});

app.use("/api", router);
```

## Examples & Defaults

```typescript
const createUserSchema = infer.object({
  email: infer.string().email(),
  name: infer.string(),
  role: infer.string(["user", "admin"]).default("user"),
});

app.post("/users", {
  schema: { body: createUserSchema },
  examples: [
    {
      name: "Create Regular User",
      value: {
        email: "john@example.com",
        name: "John Doe",
        role: "user",
      },
    },
    {
      name: "Create Admin User",
      value: {
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      },
    },
  ],
  controller: async (ctx) => {
    ctx.res.status(201).json(await createUser(ctx.body));
  },
});
```

## Swagger Customization

### Branding

```typescript
registerDocs(app, {
  title: "My Company API",
  version: "1.0.0",
  description: "Production-grade API",
  contact: {
    name: "API Support",
    url: "https://example.com/support",
    email: "support@example.com",
  },
  license: {
    name: "MIT",
    url: "https://opensource.org/licenses/MIT",
  },
});
```

### Swagger UI Customization

```typescript
registerDocs(app, {
  title: "My API",
  swaggerOptions: {
    swaggerUrl: "/docs/swagger.json",
    apisSorter: "alpha",
    operationsSorter: "method",
    displayOperationId: true,
    filter: true,
    showRequestHeaders: true,
    defaultModelsExpandDepth: 1,
  },
});
```

## Endpoints

After registering docs:

- **GET /docs** - Swagger UI
- **GET /docs/redoc** - ReDoc
- **GET /docs/openapi.json** - OpenAPI 3.0 specification
- **GET /docs/swagger.json** - Swagger 2.0 specification (if enabled)

## Best Practices

### 1. Describe All Fields

```typescript
// Good
const schema = infer.object({
  email: infer.string().email().describe("Email address"),
  name: infer.string().describe("Full name"),
});

// Bad
const schema = infer.object({
  email: infer.string().email(),
  name: infer.string(),
});
```

### 2. Use Consistent Tags

```typescript
const TAGS = {
  USERS: "Users",
  POSTS: "Posts",
  AUTH: "Authentication",
} as const;

app.get("/users", { tags: [TAGS.USERS], /* ... */ });
app.get("/posts", { tags: [TAGS.POSTS], /* ... */ });
app.post("/login", { tags: [TAGS.AUTH], /* ... */ });
```

### 3. Document Error Codes

```typescript
app.post("/users", {
  schema: { /* ... */ },
  controller: async (ctx) => {
    if (await userExists(ctx.body.email)) {
      // Document this error in OpenAPI
      ctx.res.status(409).json({
        error: "Email already registered",
        code: "EMAIL_EXISTS",
      });
      return;
    }
  },
});
```

### 4. Use Versioning

```typescript
app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);

registerDocs(app, {
  title: "My API",
  version: "2.0.0",
});
```

### 5. Hide Internal Routes

```typescript
// Public routes
app.get("/users", {
  tags: ["Users"],  // Will appear in docs
  controller: (ctx) => {
    ctx.res.json(users);
  },
});

// Internal routes
app.get("/health", {
  // No tags - won't appear in docs
  controller: (ctx) => {
    ctx.res.json({ ok: true });
  },
});
```

## Common Pitfalls

### ❌ Missing Descriptions

```typescript
// Wrong: No context
app.get("/api/data", {
  schema: { query: infer.object({ id: infer.string() }) },
  controller: (ctx) => { /* ... */ },
});

// Correct: Clear documentation
app.get("/api/users/:id", {
  summary: "Get User by ID",
  description: "Retrieve a specific user profile",
  tags: ["Users"],
  schema: {
    params: infer.object({ id: infer.string().describe("User ID") }),
  },
  controller: (ctx) => { /* ... */ },
});
```

### ❌ Inconsistent Response Types

```typescript
// Wrong: Different responses
app.get("/users/:id", {
  controller: (ctx) => {
    if (found) ctx.res.json({ user: {} });
    else ctx.res.json({ error: "not found" });
  },
});

// Correct: Consistent structure
app.get("/users/:id", {
  controller: (ctx) => {
    if (!found) {
      ctx.res.status(404).json({ error: "not found" });
      return;
    }
    ctx.res.json({ user: {} });
  },
});
```

## Next Steps

- Learn about [Validation](./validation.md) for schema design
- Explore [Routing](./router.md) for endpoint organization
- Read [Best Practices](./best-practices.md)
- Check [Security](./security.md) for authentication docs
