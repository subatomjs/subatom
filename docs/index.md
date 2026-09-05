# Subatom Documentation Index

Complete guide to building production-grade applications with Subatom framework v2.0.1.

## Quick Navigation

### Getting Started
- **[Introduction](./introduction.md)** - Framework overview, features, and quick start
- **[Architecture](./architecture.md)** - Request lifecycle, component design, and performance model

### Core Concepts
- **[Router](./router.md)** - Route registration, path parameters, grouping, and resource routing
- **[Context](./context.md)** - Type-safe request/response handling with type inference
- **[Validation](./validation.md)** - Schema validation, type coercion, and file validation
- **[Middleware](./middleware.md)** - Middleware patterns, transformers, interceptors, serializers

### Advanced Features
- **[File Upload](./file-upload.md)** - Multipart form handling, storage strategies, streaming
- **[Error Handling](./error-handling.md)** - Error types, global handlers, error middleware
- **[Configuration](./configuration.md)** - Environment setup, .env files, runtime config
- **[OpenAPI Documentation](./openapi.md)** - Automatic API documentation with Swagger/ReDoc

### Production
- **[Security](./security.md)** - Authentication, CSRF, CORS, rate limiting, input validation
- **[Best Practices](./best-practices.md)** - Production setup, monitoring, graceful shutdown
- **[Testing](./testing.md)** - Unit tests, integration tests, mocking, performance testing

## Feature Matrix

| Feature | Document | Status |
|---------|----------|--------|
| Routing & URL parameters | [Router](./router.md) | ✅ Complete |
| Request/Response handling | [Context](./context.md) | ✅ Complete |
| Schema validation | [Validation](./validation.md) | ✅ Complete |
| File uploads | [File Upload](./file-upload.md) | ✅ Complete |
| Middleware pipeline | [Middleware](./middleware.md) | ✅ Complete |
| Error handling | [Error Handling](./error-handling.md) | ✅ Complete |
| Configuration management | [Configuration](./configuration.md) | ✅ Complete |
| API documentation | [OpenAPI](./openapi.md) | ✅ Complete |
| Authentication | [Security](./security.md) | ✅ Complete |
| Production deployment | [Best Practices](./best-practices.md) | ✅ Complete |
| Testing strategies | [Testing](./testing.md) | ✅ Complete |

## Learning Path

### For Beginners

1. Start with [Introduction](./introduction.md) to understand framework philosophy
2. Read [Architecture](./architecture.md) to learn how requests flow
3. Explore [Router](./router.md) to build your first routes
4. Learn [Context](./context.md) for request/response handling
5. Add [Validation](./validation.md) to validate user input

### For Intermediate Users

1. Master [Middleware](./middleware.md) for cross-cutting concerns
2. Implement [Error Handling](./error-handling.md) for production apps
3. Handle [File Upload](./file-upload.md) for multipart data
4. Set up [Configuration](./configuration.md) for different environments
5. Document your API with [OpenAPI](./openapi.md)

### For Advanced Users

1. Implement [Security](./security.md) best practices
2. Design [Best Practices](./best-practices.md) architecture
3. Write comprehensive [Testing](./testing.md)
4. Optimize performance and monitoring
5. Deploy to production

## Common Tasks

### Creating Your First API

```typescript
import { Subatom } from "subatom";
import infer from "subatom-infer";

const app = new Subatom();

// Define route
app.get("/hello", {
  controller: (ctx) => {
    ctx.res.json({ message: "Hello, World!" });
  },
});

// Start server
await app.listen(3000);
console.log("Server running on http://localhost:3000");

// Test: curl http://localhost:3000/hello
```

→ See [Router](./router.md) and [Context](./context.md)

### Adding Request Validation

```typescript
app.post("/users", {
  schema: {
    body: infer.object({
      email: infer.string().email(),
      name: infer.string().min(1),
    }),
  },
  controller: async (ctx) => {
    const user = await createUser(ctx.body);
    ctx.res.status(201).json(user);
  },
});
```

→ See [Validation](./validation.md) and [Error Handling](./error-handling.md)

### Handling File Uploads

```typescript

app.post("/avatar", {
  schema: {
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    if (!ctx.files.file) {
      ctx.res.status(400).json({ error: "No file provided" });
      return;
    }

    const buffer = await ctx.files.file.buffer();
    await saveAvatar(buffer);
    await ctx.files.file.destroy();
    
    ctx.res.json({ success: true });
  },
});
```

→ See [File Upload](./file-upload.md)

### Adding Authentication

```typescript
const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    res.status(401).json({ error: "No token" });
    return;
  }

  try {
    req.user = await verifyToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

app.use(requireAuth);
```

→ See [Security](./security.md) and [Middleware](./middleware.md)

### Setting Up Error Handling

```typescript
import { SubatomError, UnprocessableEntityError } from "subatom";

app.useError((err, req, res, next) => {
  if (err instanceof UnprocessableEntityError) {
    res.status(422).json({ error: "Validation failed", details: err.details });
    return;
  }
  next(err);
});

app.useError((err, req, res) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});
```

→ See [Error Handling](./error-handling.md)

### Configuring for Production

```bash
# .env.production
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
JWT_SECRET=<strong-secret>
DATABASE_URL=<production-db>
```

```typescript
// src/index.ts
const app = new Subatom();

// Setup middleware
setupMiddleware(app);
setupErrorHandling(app);

// Start with graceful shutdown
const server = await app.listen(process.env.PORT || 3000);
process.on("SIGTERM", () => app.gracefulShutdown());
```

→ See [Best Practices](./best-practices.md)

### Writing Tests

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { Subatom } from "subatom";

describe("Users", () => {
  const app = new Subatom();
  
  // Setup routes
  
  it("should create user", async () => {
    const response = await request(app.raw)
      .post("/users")
      .send({ email: "test@example.com", name: "Test" })
      .expect(201);
    
    expect(response.body).toHaveProperty("id");
  });
});
```

→ See [Testing](./testing.md)

## API Reference Quick Links

### Subatom Class
- [Subatom API](./subatom.md) - Application setup, configuration, routing

### Router Class
- [Router Methods](./router.md#router-methods) - Route registration, grouping, resource routing

### Context Object
- [Context Properties](./context.md#properties) - Request data access, response methods
- [Context Methods](./context.md#methods) - Type-safe facades for request/response

### Validation
- [Supported Validators](./validation.md#supported-validators) - subatom-infer, Joi, Yup, Valibot
- [Validation Examples](./validation.md#validation-examples) - Body, query, params, headers, files

### Middleware & Pipelines
- [Middleware Types](./middleware.md#middleware-basics) - Global, path-scoped, route-scoped
- [Pipeline Execution Order](./middleware.md#pipeline-execution-order) - Transformer, interceptor, serializer lifecycle

### Error Handling
- [Built-in Errors](./error-handling.md#error-types) - NotFoundError, BadRequestError, FileFilterError, etc.
- [Error Middleware](./error-handling.md#error-middleware) - Global error handlers

### File Upload
- [FileUpload Class](./file-upload.md#fileupload-class) - Properties and methods
- [Storage Strategies](./file-upload.md#storage-strategies) - Memory vs disk

## CLI Commands

```bash
# Development
npx subatom dev          # Run with hot reload
npx subatom build        # Build for production
npx subatom start        # Run production build

# Help
npx subatom --help       # Show all commands
```

## Configuration

**Configuration File:** `subatom.config.ts` or `.subatomrc.json`

**Environment Variables:** `SUBATOM_PORT`, `SUBATOM_HOST`, `SUBATOM_ENTRY`, etc.

**Runtime:** `app.setConfig({...})`

→ See [Configuration](./configuration.md)

## Performance Benchmarks

Subatom is built for performance:

- **Routing:** O(1) Trie-based path matching
- **Memory:** ~100MB base footprint
- **Requests:** Handles 10,000+ req/s (single core)
- **Startup:** < 100ms cold start

→ See [Architecture](./architecture.md#performance-characteristics)

## Troubleshooting

### Common Issues

**Issue:** Routes not matching
→ Check [Router](./router.md#route-matching-rules) for path matching rules (static > parameter > wildcard)

**Issue:** Validation errors
→ Review [Validation](./validation.md) schema and error handling

**Issue:** File upload failures
→ Check [File Upload](./file-upload.md#error-handling) error handling and cleanup

**Issue:** Memory leaks
→ Review [File Upload](./file-upload.md#cleanup) cleanup patterns

**Issue:** Unhandled errors crashing server
→ Implement [Error Handling](./error-handling.md) middleware

## Contributing to Documentation

Documentation should:
- Include working code examples
- Show both correct and incorrect patterns
- Cover edge cases and common pitfalls
- Link to related sections
- Match production-grade writing style

## Glossary of Terms

- **Handler/Controller** - Function that processes a request
- **Middleware** - Function that runs before handler
- **Transformer** - Lifecycle hook (beforeRequest, afterRequest, etc.)
- **Interceptor** - Middleware-style hook with next() pattern
- **Serializer** - Response formatter (JSON, XML, CSV, etc.)
- **Schema** - subatom-infer/Joi/Yup/Valibot validation definition
- **Route** - HTTP endpoint (method + path)
- **Router** - Collection of routes
- **Context** - Request + response + locals combined
- **Locals** - Request-scoped data storage

## Resources

- **GitHub:** https://github.com/subatom/framework
- **NPM:** https://www.npmjs.com/package/subatom
- **Issues:** https://github.com/subatom/framework/issues
- **Discussions:** https://github.com/subatom/framework/discussions

## Support

- **Documentation:** This guide
- **Community:** GitHub Discussions
- **Issues:** GitHub Issues
- **Security:** security@subatom.dev

---

**Version:** 2.0.1  
**Last Updated:** 2024  
**License:** MIT
