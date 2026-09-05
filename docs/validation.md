# Request Validation

Subatom's validation system integrates with standard schema validators (subatom-infer, Joi, Yup, etc.) to validate request body, query, params, headers, and files with full type inference.

## Overview

Validation in Subatom:
- Integrates with any standard schema validator
- Validates body, query, params, headers, and files
- Performs type coercion and transformation
- Returns detailed validation errors
- Provides full TypeScript type inference

## Supported Validators

Subatom works with any validator implementing the Standard Schema specification:

- **subatom-infer** (recommended) - TypeScript-first schema validation
- **Joi** - Popular JavaScript validation
- **Yup** - Lightweight schema validation
- **Valibot** - TypeScript-native validation
- Custom validators following StandardSchema protocol

## Basic Validation

### Body Validation

```typescript
import infer from "subatom-infer";
import type { IContext } from "subatom";

const createUserSchema = infer.object({
  name: infer.string().min(1).max(100),
  email: infer.string().email(),
  age: infer.number().int().min(0).max(150),
});

app.post("/users", {
  schema: {
    body: createUserSchema,
  },
  controller: (ctx) => {
    // ctx.body is validated and typed
    const { name, email, age } = ctx.body;
    ctx.res.status(201).json({ id: "1", name, email, age });
  },
});
```

### Query Validation

```typescript
const searchSchema = infer.object({
  q: infer.string().min(1),
  limit: infer.string().transform(Number).pipe(infer.number().int().min(1).max(100)),
  offset: infer.string().transform(Number).pipe(infer.number().int().min(0)).optional(),
});

app.get("/search", {
  schema: {
    query: searchSchema,
  },
  controller: (ctx) => {
    // ctx.query is validated and typed
    const { q, limit, offset } = ctx.query;
    ctx.res.json({ results: [], q, limit, offset });
  },
});
```

### Parameter Validation

```typescript
const getUserParamsSchema = infer.object({
  id: infer.string().uuid(),
});

app.get("/users/:id", {
  schema: {
    params: getUserParamsSchema,
  },
  controller: (ctx) => {
    // ctx.params.id is guaranteed to be a valid UUID
    ctx.res.json({ id: ctx.params.id });
  },
});
```

### Headers Validation

```typescript
const authHeaderSchema = infer.object({
  authorization: infer.string().regex(/^Bearer /, "Invalid authorization format"),
});

app.get("/protected", {
  schema: {
    headers: authHeaderSchema,
  },
  controller: (ctx) => {
    const token = ctx.headers.authorization.replace("Bearer ", "");
    const user = verifyJWT(token);
    ctx.res.json({ user });
  },
});
```

## Type Inference

Subatom infers request types from your validation schemas:

```typescript
import infer from "subatom-infer";

const userRouteSchema = {
  body: infer.object({
    name: infer.string(),
    email: infer.string().email(),
    age: infer.number().int(),
  }),
  params: infer.object({ id: infer.string().uuid() }),
  query: infer.object({ includeDeleted: infer.boolean().optional() }),
};

app.post<typeof userRouteSchema>("/users/:id", {
  schema: userRouteSchema,
  controller: (ctx: IContext) => {
    // All types are inferred:
    // ctx.body.name: string
    // ctx.body.email: string
    // ctx.body.age: number
    // ctx.params.id: string (guaranteed valid UUID)
    // ctx.query.includeDeleted: boolean | undefined
  },
});
```

## Advanced Validation

### Conditional Validation

```typescript
const userSchema = infer.object({
  type: infer.string(["student", "teacher"]),
  name: infer.string(),
  studentId: infer.string().optional(),
  department: infer.string().optional(),
}).refine(
  (data) => data.type === "student" ? !!data.studentId : !!data.department,
  { message: "Invalid fields for user type" }
);

app.post("/users", {
  schema: { body: userSchema },
  controller: (ctx) => {
    // Validation ensures consistent data based on type
  },
});
```

### Cross-Field Validation

```typescript
const passwordChangeSchema = infer.object({
  currentPassword: infer.string(),
  newPassword: infer.string().min(8),
  confirmPassword: infer.string(),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  }
);

app.post("/change-password", {
  schema: { body: passwordChangeSchema },
  controller: (ctx) => {
    // Passwords are guaranteed to match
  },
});
```

### Coercion and Transformation

```typescript
const filterSchema = infer.object({
  status: infer.string(["active", "inactive"]),
  limit: infer.string().transform(Number).pipe(infer.number().positive()),
  offset: infer.string().transform(Number).pipe(infer.number().min(0)).optional(),
  sortBy: infer.string().default("createdAt"),
  tags: infer.string().transform((s) => s.split(",")).pipe(infer.array(infer.string())).optional(),
});

app.get("/items", {
  schema: { query: filterSchema },
  controller: (ctx) => {
    // Query strings are transformed:
    // ctx.query.limit: number (from "10")
    // ctx.query.offset: number | undefined (from "20" or undefined)
    // ctx.query.tags: string[] | undefined (from "tag1,tag2")
  },
});
```

## File Validation

### Single File Upload

```typescript

app.post("/avatar", {
  schema: {
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    const upload = ctx.files.file;
    if (!upload) {
      ctx.res.status(400).json({ error: "No file provided" });
      return;
    }

    // Validate file
    if (!upload.mimetype.startsWith("image/")) {
      await upload.destroy();
      ctx.res.status(400).json({ error: "Only images allowed" });
      return;
    }

    // Process file
    const buffer = await upload.buffer();
    await saveAvatar(buffer);
    await upload.destroy();

    ctx.res.json({ success: true });
  },
});
```

### Multiple Files Upload

```typescript
app.post("/photos", {
  schema: {
    files: infer.files().max(10),
  },
  controller: async (ctx) => {
    const uploads = ctx.files.files;

    const results = [];
    for (const upload of uploads.photos) {
      try {
        const buffer = await upload.buffer();
        const url = await uploadToStorage(buffer);
        results.push({ filename: upload.filename, url });
      } finally {
        await upload.destroy();
      }
    }

    ctx.res.json({ photos: results });
  },
});
```

### File with Body Validation

```typescript
app.post("/posts", {
  schema: {
    body: infer.object({
      title: infer.string(),
      content: infer.string(),
    }),
    files: infer.file().max(10485760),
  },
  controller: async (ctx) => {
    const { title, content } = ctx.body;
    const thumbnail = ctx.files.file;

    if (thumbnail) {
      const buffer = await thumbnail.buffer();
      const url = await uploadImage(buffer);
      ctx.res.status(201).json({ id: "1", title, thumbnail: url });
    } else {
      ctx.res.status(201).json({ id: "1", title });
    }
  },
});
```

## Validation Error Handling

When validation fails, a `UnprocessableEntityError` is thrown:

```typescript
import { UnprocessableEntityError } from "subatom";

app.useError((err, req, res, next) => {
  if (err instanceof UnprocessableEntityError) {
    res.status(422).json({
      error: err.message,
      code: "VALIDATION_ERROR",
      details: err.details,  // Validation errors
    });
  } else {
    next(err);
  }
});
```

## Schema Organization

### Reusable Schemas

```typescript
// schemas.ts
export const emailSchema = infer.string().email("Invalid email");
export const uuidSchema = infer.string().uuid("Invalid UUID");
export const passwordSchema = infer.string().min(8).max(128);

export const userSchema = infer.object({
  name: infer.string().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const updateUserSchema = userSchema.partial();

// routes.ts
import { userSchema, updateUserSchema } from "./schemas";

app.post("/users", {
  schema: { body: userSchema },
  controller: (ctx) => { /* ... */ },
});

app.put("/users/:id", {
  schema: { body: updateUserSchema },
  controller: (ctx) => { /* ... */ },
});
```

### Schema Composition

```typescript
const baseUserSchema = infer.object({
  email: infer.string().email(),
  name: infer.string(),
});

const createUserSchema = baseUserSchema.extend({
  password: infer.string().min(8),
});

const updateUserSchema = baseUserSchema.partial();

const filterUserSchema = infer.object({
  role: infer.string(["admin", "user"]).optional(),
  createdAfter: infer.string().datetime().optional(),
});
```

## Production Best Practices

### 1. Validate Everything

```typescript
app.post("/webhook", {
  schema: {
    body: infer.object({
      event: infer.string(["user.created", "user.deleted"]),
      data: infer.object({ id: infer.string().uuid() }),
    }),
    headers: infer.object({
      "x-signature": infer.string(),
      "content-type": infer.string("application/json"),
    }),
  },
  controller: async (ctx) => {
    // All data is validated
  },
});
```

### 2. Type-Safe Query Params

```typescript
app.get("/items", {
  schema: {
    query: infer.object({
      page: infer.string().default("1").transform(Number).pipe(infer.number().int().positive()),
      limit: infer.string().default("20").transform(Number).pipe(infer.number().int().min(1).max(100)),
      sort: infer.string(["name", "created", "updated"]).default("created"),
    }),
  },
  controller: (ctx) => {
    // ctx.query is fully typed and validated
    const { page, limit, sort } = ctx.query;
  },
});
```

### 3. Detailed Error Messages

```typescript
const userSchema = infer.object({
  name: infer.string().min(1, "Name is required").max(100, "Name too long"),
  email: infer.string().email("Invalid email format"),
  age: infer.number().int().min(18, "Must be 18 or older"),
});

app.post("/users", {
  schema: { body: userSchema },
  controller: (ctx) => { /* ... */ },
});
```

### 4. Optional vs Required Fields

```typescript
const filterSchema = infer.object({
  // Required
  keyword: infer.string().min(1),
  // Optional
  category: infer.string().optional(),
  // With default
  sort: infer.string(["asc", "desc"]).default("asc"),
  // Required but nullable
  userId: infer.string().nullable(),
});
```

## Common Pitfalls

### ❌ Not Validating Query Params

```typescript
// Wrong: Query params are strings, not numbers
app.get("/items", {
  controller: (ctx) => {
    const limit = ctx.query.limit + 10;  // "10" + 10 = "1010"!
  },
});

// Correct
app.get("/items", {
  schema: {
    query: infer.object({
      limit: infer.string().transform(Number).pipe(infer.number().int()),
    }),
  },
  controller: (ctx) => {
    const limit = ctx.query.limit + 10;  // 10 + 10 = 20 ✓
  },
});
```

### ❌ Not Cleaning Up Uploaded Files

```typescript
// Wrong: File not cleaned up on error
app.post("/avatar", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    const buffer = await ctx.files.file.buffer();
    await risky();  // Throws!
    // File cleanup never called
  },
});

// Correct
app.post("/avatar", {
  schema: { files: infer.file().max(10485760) },
  controller: async (ctx) => {
    try {
      const buffer = await ctx.files.file.buffer();
      await risky();
    } finally {
      await ctx.files.file.destroy();  // Always cleanup
    }
  },
});
```

### ❌ Overly Broad Error Catching

```typescript
// Wrong: Catches all errors
app.useError((err, req, res) => {
  res.status(422).json({ error: err.message });
});

// Correct: Only validation errors
app.useError((err, req, res, next) => {
  if (err instanceof UnprocessableEntityError) {
    res.status(422).json({ error: err.message, details: err.details });
  } else {
    next(err);
  }
});
```

## Next Steps

- Learn about [Error Handling](./error-handling.md) for validation errors
- Explore [File Upload](./file-upload.md) for advanced file handling
- Set up [Middleware](./middleware.md) for request preprocessing
- Read [Production Best Practices](./best-practices.md) for scaling
