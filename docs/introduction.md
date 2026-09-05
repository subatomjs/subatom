# Subatom Framework Documentation

## Introduction to Subatom

Subatom is a modern, high-performance, enterprise-grade web framework for Node.js, built from the ground up with TypeScript for production-scale applications. It combines the simplicity of Express with the architectural sophistication of NestJS, while maintaining exceptional performance characteristics.

### Core Philosophy

Subatom is designed around four fundamental principles:

1. **Type Safety First** - Complete TypeScript support with zero any-types in public APIs
2. **Performance at Scale** - Optimized for high-throughput, low-latency production workloads
3. **Enterprise-Ready** - Built-in support for advanced patterns: middleware, error handling, request validation, file uploads, and graceful shutdown
4. **Developer Experience** - Intuitive, fluent API with comprehensive error messages and debugging support

### What You Can Build

Subatom is ideal for:

- RESTful APIs with complex validation and transformation pipelines
- High-performance microservices with request/response lifecycle management
- Multi-tenant SaaS backends with user context and session management
- Real-time backend services with streamed file uploads and downloads
- Production systems requiring enterprise-grade error handling and observability

### Key Features

| Feature | Description |
|---------|-------------|
| **Router** | Fast route matching with parameter extraction, groups, and resource routing |
| **Middleware** | Global, group, and route-scoped middleware with error handling |
| **Pipeline System** | Composable transformers, interceptors, and serializers for request/response lifecycle |
| **Type-Safe Context** | Inferred request/response types using route schemas |
| **Request Validation** | Built-in validation with support for any standard schema validator (subatom-infer, Joi, etc.) |
| **File Upload** | Multipart form handling with disk and memory storage strategies |
| **Error Handling** | Operational error types, global error middleware, and formatted error responses |
| **Configuration** | Environment-aware configuration with file-based, environment, and runtime overrides |
| **Graceful Shutdown** | Automatic request draining, socket cleanup, and process lifecycle management |
| **OpenAPI Docs** | Automatic OpenAPI schema generation from route definitions |

## Quick Start

### Installation

```bash
npm install subatom
# or
yarn add subatom
# or
pnpm add subatom
```

### Basic Application

```typescript
import { Subatom } from "subatom";
import infer from "subatom-infer";

const app = new Subatom();

// Simple route
app.get("/", {
  controller: (ctx) => {
    ctx.res.json({ message: "Hello, World!" });
  },
});

// Route with parameters
app.get("/users/:id", {
  controller: (ctx) => {
    const userId = ctx.params.id;
    ctx.res.json({ userId });
  },
});

// POST with body validation
app.post("/users", {
  schema: {
    body: infer.object({
      name: infer.string(),
      email: infer.string().email(),
    }),
  },
  controller: (ctx) => {
    const user = ctx.body;
    ctx.res.status(201).json({ created: user });
  },
});

// Start server
await app.listen(3000);
```

### CLI Commands

Subatom provides a CLI for development and deployment:

```bash
# Start development server with hot reload
npx subatom dev

# Build production bundle
npx subatom build

# Start production server
npx subatom start

# Preview production build
npx subatom preview
```

## Documentation Structure

This documentation is organized into the following sections:

1. **Architecture** - Understanding how Subatom processes requests
2. **Core Classes** - Subatom, Router, Context, Request, Response
3. **HTTP Handling** - Request/response facades and lifecycle
4. **Middleware & Pipelines** - Middleware, transformers, interceptors, serializers
5. **Configuration** - Setting up and configuring your application
6. **Error Handling** - Operational errors and global error middleware
7. **Validation** - Request validation and schema integration
8. **File Upload** - Handling multipart form uploads
9. **Security** - Security features and best practices
10. **Production Best Practices** - Scaling, performance, and operational concerns

## Framework Versions

- **Current Version**: 2.0.1
- **Node.js Requirement**: 18.0.0 or higher
- **TypeScript**: 4.5 or higher (recommended 5.0+)
- **License**: MIT

## Getting Help

- **GitHub Issues**: https://github.com/subatomjs/subatom/issues
- **Documentation**: https://docs.subatomjs.dev
- **Community**: Open source community contributions welcome

## Convention Over Configuration

Subatom follows sensible defaults:

- Default port: 3000
- Default host: localhost (0.0.0.0 in production)
- Request body limit: 100kb
- File upload storage: disk (with temp directory)
- Error response format: JSON

All defaults can be overridden via configuration files, environment variables, or runtime settings.

## Next Steps

Start with the [Architecture Overview](./architecture.md) to understand how requests flow through Subatom, then explore specific features like [Routing](./router.md), [Request Validation](./validation.md), or [Error Handling](./error-handling.md).
