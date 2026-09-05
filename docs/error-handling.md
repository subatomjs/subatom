# Error Handling

Subatom provides a comprehensive error handling system with operational error types, global error middleware, structured error formatting, and graceful error recovery.

## Overview

Subatom's error handling:
- Distinguishes between operational and programming errors
- Normalizes errors to Error instances
- Supports global error middleware
- Provides structured error formatting
- Enables request recovery after errors
- Includes built-in error types for common scenarios

## Error Types

### SubatomError

Base error class for all operational errors:

```typescript
import { SubatomError } from "subatom";

const error = new SubatomError("Something went wrong", {
  statusCode: 500,
  errorCode: "INTERNAL_ERROR",
  details: { reason: "Database timeout" },
  isOperational: true,
});

error.statusCode;      // 500
error.errorCode;       // "INTERNAL_ERROR"
error.details;         // { reason: "Database timeout" }
error.isOperational;   // true
```

### Built-in Error Types

Subatom includes pre-built error classes for common scenarios:

#### NotFoundError

```typescript
import { NotFoundError } from "subatom";
import { Subatom, IContext } from "subatom";

const app = new Subatom();

app.get("/users/:id", {
  controller: async (ctx: IContext) => {
    const user = await findUser(ctx.params.id);
    if (!user) {
      throw new NotFoundError(`User ${ctx.params.id} not found`);
    }
    ctx.res.json(user);
  },
});

// Automatically sends: { statusCode: 404, errorCode: "NOT_FOUND" }
```

#### BadRequestError

```typescript
import { BadRequestError } from "subatom";
import infer from "subatom-infer";
import { Subatom, IContext } from "subatom";

const app = new Subatom();

const dataSchema = {
  body: infer.object({
    required: infer.string(),
  }),
};

app.post("/data", {
  schema: dataSchema,
  controller: (ctx: IContext) => {
    if (!ctx.body.required) {
      throw new BadRequestError("Missing required field", { field: "required" });
    }
    ctx.res.json({ success: true });
  },
});

// Sends: { statusCode: 400, errorCode: "BAD_REQUEST" }
```

#### UnprocessableEntityError

```typescript
import { UnprocessableEntityError } from "subatom";
import infer from "subatom-infer";
import { Subatom, IContext } from "subatom";

const userSchema = {
  body: infer.object({
    email: infer.string().email(),
    name: infer.string(),
  }),
};

const app = new Subatom();

app.post("/users", {
  schema: userSchema,
  controller: async (ctx: IContext) => {
    if (await userExists(ctx.body.email)) {
      throw new UnprocessableEntityError(
        "Email already exists",
        { field: "email" }
      );
    }
    ctx.res.status(201).json({ success: true });
  },
});

// Sends: { statusCode: 422, errorCode: "UNPROCESSABLE_ENTITY" }
```

#### PayloadTooLargeError

```typescript
import { PayloadTooLargeError } from "subatom";
import { Subatom, IRequest, IResponse } from "subatom";

const app = new Subatom();

app.use((req: IRequest, res: IResponse, next: () => Promise<void>) => {
  const contentLength = parseInt(req.raw.headers["content-length"] || "0", 10);
  if (contentLength > 10 * 1024 * 1024) {
    throw new PayloadTooLargeError("Request body exceeds 10MB limit");
  }
  next();
});

// Sends: { statusCode: 413, errorCode: "PAYLOAD_TOO_LARGE" }
```

#### MethodNotAllowedError

```typescript
import { MethodNotAllowedError } from "subatom";
import { Subatom, IContext } from "subatom";

const app = new Subatom();

app.get("/data", {
  controller: (ctx: IContext) => {
    if (ctx.req.method === "DELETE") {
      throw new MethodNotAllowedError();
    }
    ctx.res.json({ data: "read-only" });
  },
});

// Sends: { statusCode: 405, errorCode: "METHOD_NOT_ALLOWED" }
```

#### FileFilterError

```typescript
import { FileFilterError } from "subatom";
import infer from "subatom-infer";
import { Subatom, IContext } from "subatom";

const app = new Subatom();

const avatarSchema = {
  files: infer.file().mime(["image/jpeg", "image/png", "image/webp"]),
};

app.post("/avatar", {
  schema: avatarSchema,
  controller: async (ctx: IContext) => {
    if (!ctx.files.file || !ctx.files.file.mimetype.startsWith("image/")) {
      throw new FileFilterError("Only image files are allowed");
    }
    ctx.res.json({ success: true });
  },
});

// Sends: { statusCode: 422, errorCode: "FILE_FILTER_ERROR" }
```

### Custom Error Types

Create application-specific error types:

```typescript
import { SubatomError } from "subatom";

class UnauthorizedError extends SubatomError {
  constructor(message: string = "Unauthorized") {
    super(message, {
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      isOperational: true,
    });
    this.name = "UnauthorizedError";
  }
}

class ForbiddenError extends SubatomError {
  constructor(message: string = "Forbidden") {
    super(message, {
      statusCode: 403,
      errorCode: "FORBIDDEN",
      isOperational: true,
    });
    this.name = "ForbiddenError";
  }
}

class ConflictError extends SubatomError {
  constructor(message: string = "Conflict", details?: unknown) {
    super(message, {
      statusCode: 409,
      errorCode: "CONFLICT",
      details,
      isOperational: true,
    });
    this.name = "ConflictError";
  }
}
```

## Global Error Middleware

### Basic Error Handler

```typescript
import { Subatom, IRequest, IResponse } from "subatom";
import { SubatomError } from "subatom";

const app = new Subatom();

app.useError((err: Error, req: IRequest, res: IResponse) => {
  const statusCode = (err as any).statusCode || 500;
  const errorCode = (err as any).errorCode || "INTERNAL_SERVER_ERROR";
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    error: message,
    code: errorCode,
  });
});
```

### Error Handler with Logging

```typescript
import { Subatom, IRequest, IResponse } from "subatom";

const app = new Subatom();

app.useError((err: Error, req: IRequest, res: IResponse) => {
  const statusCode = (err as any).statusCode || 500;
  const errorLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    errorCode: (err as any).errorCode,
    message: err.message,
    stack: err.stack,
  };

  if (statusCode < 500) {
    console.warn("Client error:", errorLog);
  } else {
    console.error("Server error:", errorLog);
  }

  res.status(statusCode).json({
    error: err.message,
    code: (err as any).errorCode || "INTERNAL_SERVER_ERROR",
    requestId: req.headers["x-request-id"],
  });
});
```

### Environment-Specific Error Handling

```typescript
import { Subatom, IRequest, IResponse } from "subatom";

const app = new Subatom();

if (process.env.NODE_ENV === "development") {
  app.useError((err: Error, req: IRequest, res: IResponse) => {
    res.status((err as any).statusCode || 500).json({
      error: err.message,
      code: (err as any).errorCode,
      details: (err as any).details,
      stack: err.stack,
      request: {
        method: req.method,
        path: req.path,
        headers: req.headers,
      },
    });
  });
} else {
  app.useError((err: Error, req: IRequest, res: IResponse) => {
    const statusCode = (err as any).statusCode || 500;

    res.status(statusCode).json({
      error: statusCode === 500 ? "Internal Server Error" : err.message,
      code: (err as any).errorCode || "INTERNAL_SERVER_ERROR",
    });
  });
}
```

### Error Handler with Recovery

```typescript
import { Subatom, IRequest, IResponse } from "subatom";
import {
  UnprocessableEntityError,
  NotFoundError,
  SubatomError,
} from "subatom";

const app = new Subatom();

app.useError(
  (
    err: Error,
    req: IRequest,
    res: IResponse,
    next: (err?: Error) => Promise<void>
  ) => {
    if (err instanceof UnprocessableEntityError) {
      res.status(422).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: (err as any).details,
      });
      return;
    }

    if (err instanceof NotFoundError) {
      res.status(404).json({
        error: "Not found",
        code: "NOT_FOUND",
      });
      return;
    }

    next(err);
  }
);

app.useError((err: Error, req: IRequest, res: IResponse) => {
  res.status(500).json({
    error: "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
  });
});
```

## Error Handling in Routes

### Try-Catch in Handler

```typescript
import { Subatom, IContext } from "subatom";
import infer from "subatom-infer";
import { BadRequestError } from "subatom";

const dataSchema = {
  body: infer.object({
    value: infer.string(),
  }),
};

const app = new Subatom();

app.post("/data", {
  schema: dataSchema,
  controller: async (ctx: IContext) => {
    try {
      const result = await processData(ctx.body);
      ctx.res.json(result);
    } catch (err: any) {
      if (err.code === "VALIDATION_ERROR") {
        throw new BadRequestError(err.message);
      }
      throw err;
    }
  },
});
```

### Async Error Handling

```typescript
import { Subatom, IContext } from "subatom";
import { NotFoundError, SubatomError } from "subatom";

const app = new Subatom();

app.get("/users/:id", {
  controller: async (ctx: IContext) => {
    try {
      const user = await db.users.findById(ctx.params.id);
      if (!user) {
        throw new NotFoundError();
      }
      ctx.res.json(user);
    } catch (err: any) {
      if (err instanceof NotFoundError) {
        throw err;
      }
      throw new SubatomError("Database error", { statusCode: 503 });
    }
  },
});
```

## Error Handling in Middleware

### Error Middleware with Next

```typescript
import { Subatom, IRequest, IResponse } from "subatom";
import { UnprocessableEntityError } from "subatom";

const app = new Subatom();

app.useError(
  (
    err: Error,
    req: IRequest,
    res: IResponse,
    next: (err?: Error) => Promise<void>
  ) => {
    if (err instanceof UnprocessableEntityError) {
      res.status(422).json({ error: err.message });
      return;
    }
    next(err);
  }
);

app.useError((err: Error, req: IRequest, res: IResponse) => {
  res.status(500).json({ error: "Internal Server Error" });
});
```

### Middleware Error Handling

```typescript
import { IRequest, IResponse } from "subatom";

async function errorHandlingMiddleware(
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> {
  try {
    const data = await fetchData();
    (req as any).locals = (req as any).locals || {};
    (req as any).locals.data = data;
    next();
  } catch (err) {
    throw err;
  }
}
```

## Error Normalization

### The normalizeError Function

Subatom automatically normalizes non-Error values thrown or rejected:

```typescript
import { normalizeError } from "subatom";

// String
const err1 = normalizeError("Something failed");
// => SubatomError("Something failed")

// Plain object
const err2 = normalizeError({ message: "Error", code: 123 });
// => SubatomError("A non-Error value was thrown...")
// Details contain the original object

// Error instance (returned as-is)
const err3 = normalizeError(new TypeError("Invalid type"));
// => TypeError (unchanged)
```

## Operational vs Programming Errors

### Operational Errors

Expected errors from normal operation (should be caught):

```typescript
import { NotFoundError, BadRequestError, SubatomError } from "subatom";

// User not found
throw new NotFoundError("User not found");

// Invalid input
throw new BadRequestError("Invalid email");

// Rate limited
throw new SubatomError("Too many requests", {
  statusCode: 429,
  errorCode: "RATE_LIMITED",
});
```

### Programming Errors

Unexpected errors from bugs (indicate problems):

```typescript
// TypeError: Cannot read property 'id' of undefined
const id = (user as any).id;  // User is undefined!

// ReferenceError: functionDoesNotExist is not defined
// functionDoesNotExist();

// SyntaxError: Unexpected token
// JSON.parse(invalidJson);
```

Subatom logs programming errors for debugging:

```typescript
import { Subatom, IRequest, IResponse } from "subatom";

const app = new Subatom();

app.useError((err: Error, req: IRequest, res: IResponse) => {
  const isOperational = (err as any).isOperational ?? false;

  if (!isOperational) {
    console.error("Programming error:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      request: {
        method: req.method,
        path: req.path,
      },
    });
  }

  res.status(500).json({
    error: "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
  });
});
```

## Error Response Format

### Standard Error Response

```typescript
import { Subatom, IRequest, IResponse } from "subatom";

const app = new Subatom();

app.useError((err: Error, req: IRequest, res: IResponse) => {
  res.status((err as any).statusCode || 500).json({
    error: err.message,
    code: (err as any).errorCode || "INTERNAL_SERVER_ERROR",
    statusCode: (err as any).statusCode || 500,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  });
});
```

### Validation Error Response

```typescript
import { Subatom, IRequest, IResponse } from "subatom";
import { UnprocessableEntityError } from "subatom";

const app = new Subatom();

app.useError(
  (
    err: Error,
    req: IRequest,
    res: IResponse,
    next: (err?: Error) => Promise<void>
  ) => {
    if (err instanceof UnprocessableEntityError) {
      res.status(422).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: (err as any).details,
        fields: extractFields((err as any).details),
      });
    } else {
      next(err);
    }
  }
);

function extractFields(details: any): Record<string, string> {
  const fields: Record<string, string> = {};
  if (details && typeof details === "object") {
    for (const [key, value] of Object.entries(details)) {
      fields[key] = String(value);
    }
  }
  return fields;
}
```

## Best Practices

### 1. Use Operational Error Types

```typescript
import { NotFoundError } from "subatom";

// ✓ Good: Clear error type
if (!user) throw new NotFoundError("User not found");

// ✗ Avoid: Generic error
// if (!user) throw new Error("User not found");
```

### 2. Include Relevant Details

```typescript
import { BadRequestError } from "subatom";
import { IContext } from "subatom";

// ✓ Good: Includes context
throw new BadRequestError("Invalid user ID format", {
  field: "userId",
  provided: (null as any).params?.userId,
  expected: "UUID",
});

// ✗ Avoid: Missing context
// throw new BadRequestError("Invalid input");
```

### 3. Multiple Error Handlers

```typescript
import { Subatom, IRequest, IResponse } from "subatom";

const app = new Subatom();

interface ValidationError extends Error {
  code: string;
}

interface AuthenticationError extends Error {
  code: string;
}

// Specific handlers first
app.useError(
  (
    err: Error,
    req: IRequest,
    res: IResponse,
    next: (err?: Error) => Promise<void>
  ) => {
    if ((err as ValidationError).code === "VALIDATION_ERROR") {
      res.status(422).json({ error: err.message });
    } else {
      next(err);
    }
  }
);

app.useError(
  (
    err: Error,
    req: IRequest,
    res: IResponse,
    next: (err?: Error) => Promise<void>
  ) => {
    if ((err as AuthenticationError).code === "AUTH_ERROR") {
      res.status(401).json({ error: err.message });
    } else {
      next(err);
    }
  }
);

// Generic handler last
app.useError((err: Error, req: IRequest, res: IResponse) => {
  res.status(500).json({ error: "Internal Server Error" });
});
```

### 4. Log Errors for Debugging

```typescript
import { Subatom, IRequest, IResponse } from "subatom";
import { SubatomError } from "subatom";

const app = new Subatom();

app.useError((err: Error, req: IRequest, res: IResponse) => {
  const statusCode = (err as SubatomError).statusCode || 500;

  console.error({
    timestamp: new Date().toISOString(),
    level: statusCode >= 500 ? "error" : "warn",
    error: {
      name: err.name,
      message: err.message,
      code: (err as any).errorCode,
      statusCode,
    },
    request: {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    },
  });

  res.status(statusCode).json({
    error: err.message,
    code: (err as any).errorCode,
  });
});
```

### 5. Graceful Degradation

```typescript
import { Subatom, IRequest, IResponse } from "subatom";

const app = new Subatom();

app.useError((err: Error, req: IRequest, res: IResponse) => {
  const isDev = process.env.NODE_ENV === "development";
  const statusCode = (err as any).statusCode || 500;

  if (isDev) {
    res.status(statusCode).json({
      error: err.message,
      code: (err as any).errorCode,
      stack: err.stack,
      details: (err as any).details,
    });
  } else {
    res.status(statusCode).json({
      error: statusCode === 500 ? "Internal Server Error" : err.message,
      code: (err as any).errorCode || "INTERNAL_SERVER_ERROR",
    });
  }
});
```

## Common Pitfalls

### ❌ Throwing Plain Errors

```typescript
import { NotFoundError } from "subatom";

// Wrong
if (!data) throw Error("Not found");

// Correct
if (!data) throw new NotFoundError();
```

### ❌ Not Re-throwing from Middleware

```typescript
import { IRequest, IResponse } from "subatom";

// Wrong: Error lost
async function middleware(
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> {
  try {
    await risky();
  } catch (err) {
    console.error(err);
  }
  next();
}

// Correct
async function middlewareFixed(
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> {
  try {
    await risky();
  } catch (err) {
    throw err;
  }
}

async function risky(): Promise<void> {
  throw new Error("Operation failed");
}
```

### ❌ Catching All Errors Generically

```typescript
import { Subatom, IRequest, IResponse } from "subatom";
import { NotFoundError, BadRequestError } from "subatom";

const app = new Subatom();

// Wrong: Can't distinguish error types
app.useError((err: Error, req: IRequest, res: IResponse) => {
  res.status(500).json({ error: err.message });
});

// Correct: Handle by type
app.useError(
  (
    err: Error,
    req: IRequest,
    res: IResponse,
    next: (err?: Error) => Promise<void>
  ) => {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
    } else if (err instanceof BadRequestError) {
      res.status(400).json({ error: err.message });
    } else {
      next(err);
    }
  }
);
```

## Next Steps

- Learn about [Request Validation](./validation.md) error handling
- Explore [Middleware](./middleware.md) error propagation
- Set up [Logging](./logging.md) for error tracking
- Read [Production Best Practices](./best-practices.md)

```typescript
import { SubatomError } from "subatom";

const error = new SubatomError("Something went wrong", {
  statusCode: 500,
  errorCode: "INTERNAL_ERROR",
  details: { reason: "Database timeout" },
  isOperational: true,
});

error.statusCode;      // 500
error.errorCode;       // "INTERNAL_ERROR"
error.details;         // { reason: "Database timeout" }
error.isOperational;   // true
```

### Built-in Error Types

Subatom includes pre-built error classes for common scenarios:

#### NotFoundError

```typescript
import { NotFoundError } from "subatom";

app.get("/users/:id", {
  controller: async (ctx) => {
    const user = await findUser(ctx.params.id);
    if (!user) {
      throw new NotFoundError(`User ${ctx.params.id} not found`);
    }
    ctx.res.json(user);
  },
});

// Automatically sends: { statusCode: 404, errorCode: "NOT_FOUND" }
```

#### BadRequestError

```typescript
import { BadRequestError } from "subatom";

app.post("/data", {
  controller: (ctx) => {
    if (!ctx.body.required) {
      throw new BadRequestError("Missing required field", { field: "required" });
    }
  },
});

// Sends: { statusCode: 400, errorCode: "BAD_REQUEST" }
```

#### UnprocessableEntityError

```typescript
import { UnprocessableEntityError } from "subatom";

app.post("/users", {
  schema: { body: userSchema },
  controller: (ctx) => {
    if (userExists(ctx.body.email)) {
      throw new UnprocessableEntityError(
        "Email already exists",
        { field: "email" }
      );
    }
  },
});

// Sends: { statusCode: 422, errorCode: "UNPROCESSABLE_ENTITY" }
```

#### PayloadTooLargeError

```typescript
import { PayloadTooLargeError } from "subatom";

app.use((req, res, next) => {
  if (req.raw.headers["content-length"] > 10 * 1024 * 1024) {
    throw new PayloadTooLargeError("Request body exceeds 10MB limit");
  }
  next();
});

// Sends: { statusCode: 413, errorCode: "PAYLOAD_TOO_LARGE" }
```

#### MethodNotAllowedError

```typescript
import { MethodNotAllowedError } from "subatom";

app.get("/data", {
  controller: (ctx) => {
    if (isReadOnly && ctx.method === "DELETE") {
      throw new MethodNotAllowedError();
    }
  },
});

// Sends: { statusCode: 405, errorCode: "METHOD_NOT_ALLOWED" }
```

#### FileFilterError

```typescript
import { FileFilterError } from "subatom";

app.post("/avatar", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    if (!ctx.files.file.mimetype.startsWith("image/")) {
      throw new FileFilterError("Only image files are allowed");
    }
  },
});

// Sends: { statusCode: 422, errorCode: "FILE_FILTER_ERROR" }
```

### Custom Error Types

Create application-specific error types:

```typescript
import { SubatomError } from "subatom";

class UnauthorizedError extends SubatomError {
  constructor(message = "Unauthorized") {
    super(message, {
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      isOperational: true,
    });
    this.name = "UnauthorizedError";
  }
}

class ForbiddenError extends SubatomError {
  constructor(message = "Forbidden") {
    super(message, {
      statusCode: 403,
      errorCode: "FORBIDDEN",
      isOperational: true,
    });
    this.name = "ForbiddenError";
  }
}

class ConflictError extends SubatomError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, {
      statusCode: 409,
      errorCode: "CONFLICT",
      details,
      isOperational: true,
    });
    this.name = "ConflictError";
  }
}
```

## Global Error Middleware

### Basic Error Handler

```typescript
app.useError((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const errorCode = err.errorCode || "INTERNAL_SERVER_ERROR";
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    error: message,
    code: errorCode,
  });
});
```

### Error Handler with Logging

```typescript
app.useError((err, req, res, next) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode: err.statusCode || 500,
    errorCode: err.errorCode,
    message: err.message,
    stack: err.stack,
  };

  // Log based on severity
  if (err.statusCode && err.statusCode < 500) {
    console.warn("Client error:", errorLog);
  } else {
    console.error("Server error:", errorLog);
  }

  res.status(err.statusCode || 500).json({
    error: err.message,
    code: err.errorCode || "INTERNAL_SERVER_ERROR",
    requestId: req.headers["x-request-id"],
  });
});
```

### Environment-Specific Error Handling

```typescript
if (process.env.NODE_ENV === "development") {
  app.useError((err, req, res) => {
    res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.errorCode,
      details: err.details,
      stack: err.stack,  // Include stack in development
      request: {
        method: req.method,
        path: req.path,
        headers: req.headers,
      },
    });
  });
} else {
  app.useError((err, req, res) => {
    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
      error: statusCode === 500 ? "Internal Server Error" : err.message,
      code: err.errorCode || "INTERNAL_SERVER_ERROR",
    });
  });
}
```

### Error Handler with Recovery

```typescript
app.useError((err, req, res, next) => {
  // Validation errors
  if (err instanceof UnprocessableEntityError) {
    res.status(422).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.details,
    });
    return;
  }

  // Authentication errors
  if (err instanceof UnauthorizedError) {
    res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
    return;
  }

  // Authorization errors
  if (err instanceof ForbiddenError) {
    res.status(403).json({
      error: "Access denied",
      code: "FORBIDDEN",
    });
    return;
  }

  // Server errors
  res.status(500).json({
    error: "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
  });
});
```

## Error Handling in Routes

### Try-Catch in Handler

```typescript
app.post("/data", {
  controller: async (ctx) => {
    try {
      const result = await processData(ctx.body);
      ctx.res.json(result);
    } catch (err) {
      if (err.code === "VALIDATION_ERROR") {
        throw new BadRequestError(err.message);
      }
      throw err;  // Re-throw for global handler
    }
  },
});
```

### Async Error Handling

```typescript
app.get("/users/:id", {
  controller: async (ctx) => {
    try {
      const user = await db.users.findById(ctx.params.id);
      if (!user) {
        throw new NotFoundError();
      }
      ctx.res.json(user);
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw err;  // Re-throw operational errors
      }
      throw new SubatomError("Database error", { statusCode: 503 });
    }
  },
});
```

## Error Handling in Middleware

### Error Middleware with Next

```typescript
app.useError((err, req, res, next) => {
  // Try to handle
  if (err instanceof ValidationError) {
    res.status(422).json({ error: err.message });
    return;
  }

  // Pass to next error handler
  next(err);
});

app.useError((err, req, res) => {
  // Fallback handler
  res.status(500).json({ error: "Internal Server Error" });
});
```

### Middleware Error Handling

```typescript
app.use(async (req, res, next) => {
  try {
    // Middleware logic
    const data = await fetchData();
    req.locals.data = data;
    next();
  } catch (err) {
    // Pass error to error middleware
    next(err);
  }
});
```

## Error Normalization

### The normalizeError Function

Subatom automatically normalizes non-Error values thrown or rejected:

```typescript
import { normalizeError } from "subatom";

// String
const err1 = normalizeError("Something failed");
// => SubatomError("Something failed")

// Plain object
const err2 = normalizeError({ message: "Error", code: 123 });
// => SubatomError("A non-Error value was thrown...")
// Details contain the original object

// Error instance (returned as-is)
const err3 = normalizeError(new TypeError("Invalid type"));
// => TypeError (unchanged)
```

## Operational vs Programming Errors

### Operational Errors

Expected errors from normal operation (should be caught):

```typescript
// User not found
throw new NotFoundError("User not found");

// Invalid input
throw new BadRequestError("Invalid email");

// Rate limited
throw new SubatomError("Too many requests", {
  statusCode: 429,
  errorCode: "RATE_LIMITED",
});
```

### Programming Errors

Unexpected errors from bugs (indicate problems):

```typescript
// TypeError: Cannot read property 'id' of undefined
const id = user.id;  // User is undefined!

// ReferenceError: functionDoesNotExist is not defined
functionDoesNotExist();

// SyntaxError: Unexpected token
JSON.parse(invalidJson);
```

Subatom logs programming errors for debugging:

```typescript
app.useError((err, req, res) => {
  const isOperational = err.isOperational ?? false;

  if (!isOperational) {
    // Programming error - log with full details
    console.error("Programming error:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      request: {
        method: req.method,
        path: req.path,
      },
    });
  }

  // Always respond with generic message for server errors
  res.status(500).json({
    error: "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
  });
});
```

## Error Response Format

### Standard Error Response

```typescript
app.useError((err, req, res) => {
  res.status(err.statusCode || 500).json({
    error: err.message,
    code: err.errorCode || "INTERNAL_SERVER_ERROR",
    statusCode: err.statusCode || 500,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  });
});
```

### Validation Error Response

```typescript
app.useError((err, req, res, next) => {
  if (err instanceof UnprocessableEntityError) {
    res.status(422).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.details,  // Field-specific errors
      fields: extractFields(err.details),
    });
  } else {
    next(err);
  }
});
```

## Best Practices

### 1. Use Operational Error Types

```typescript
// ✓ Good: Clear error type
if (!user) throw new NotFoundError("User not found");

// ✗ Avoid: Generic error
if (!user) throw new Error("User not found");
```

### 2. Include Relevant Details

```typescript
// ✓ Good: Includes context
throw new BadRequestError("Invalid user ID format", {
  field: "userId",
  provided: ctx.params.userId,
  expected: "UUID",
});

// ✗ Avoid: Missing context
throw new BadRequestError("Invalid input");
```

### 3. Multiple Error Handlers

```typescript
// Specific handlers first
app.useError((err, req, res, next) => {
  if (err instanceof ValidationError) {
    res.status(422).json({ error: err.message });
  } else {
    next(err);
  }
});

app.useError((err, req, res, next) => {
  if (err instanceof AuthenticationError) {
    res.status(401).json({ error: err.message });
  } else {
    next(err);
  }
});

// Generic handler last
app.useError((err, req, res) => {
  res.status(500).json({ error: "Internal Server Error" });
});
```

### 4. Log Errors for Debugging

```typescript
app.useError((err, req, res) => {
  // Always log for operational review
  logger.error({
    timestamp: new Date().toISOString(),
    level: err.statusCode >= 500 ? "error" : "warn",
    error: {
      name: err.name,
      message: err.message,
      code: err.errorCode,
      statusCode: err.statusCode,
    },
    request: {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    },
  });

  res.status(err.statusCode || 500).json({
    error: err.message,
    code: err.errorCode,
  });
});
```

### 5. Graceful Degradation

```typescript
app.useError((err, req, res, next) => {
  // Don't send error details in production
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.errorCode,
      stack: err.stack,
      details: err.details,
    });
  } else {
    res.status(err.statusCode || 500).json({
      error: err.statusCode === 500 ? "Internal Server Error" : err.message,
      code: err.errorCode || "INTERNAL_SERVER_ERROR",
    });
  }
});
```

## Common Pitfalls

### ❌ Throwing Plain Errors

```typescript
// Wrong
if (!data) throw Error("Not found");

// Correct
if (!data) throw new NotFoundError();
```

### ❌ Not Re-throwing from Middleware

```typescript
// Wrong: Error lost
app.use((req, res, next) => {
  try {
    risky();
  } catch (err) {
    console.error(err);  // Logs but doesn't propagate
  }
  next();
});

// Correct
app.use((req, res, next) => {
  try {
    risky();
  } catch (err) {
    next(err);  // Propagate to error middleware
  }
});
```

### ❌ Catching All Errors Generically

```typescript
// Wrong: Can't distinguish error types
app.useError((err, req, res) => {
  res.status(500).json({ error: err.message });
});

// Correct: Handle by type
app.useError((err, req, res, next) => {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
  } else if (err instanceof BadRequestError) {
    res.status(400).json({ error: err.message });
  } else {
    next(err);
  }
});
```

## Next Steps

- Learn about [Request Validation](./validation.md) error handling
- Explore [Middleware](./middleware.md) error propagation
- Set up [Logging](./logging.md) for error tracking
- Read [Production Best Practices](./best-practices.md)
