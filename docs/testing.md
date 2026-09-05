# Testing

Comprehensive guide for testing Subatom applications using Vitest with integration and unit test examples.

## Testing Setup

### Dependencies

```bash
npm install -D vitest @vitest/ui
npm install -D node-fetch supertest  # HTTP testing
npm install -D @testing-library/node  # Utilities
```

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "dist/",
      ],
    },
  },
});
```

### Test Setup

```typescript
// tests/setup.ts
import { beforeAll, afterAll } from "vitest";
import { Subatom } from "subatom";

// Global test server instance
let app: Subatom;

beforeAll(async () => {
  app = new Subatom();
  // Setup test configuration
});

afterAll(async () => {
  await app.gracefulShutdown();
});

export { app };
```

## Unit Testing

### Testing Route Handlers

```typescript
// tests/routes/users.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Subatom } from "subatom";
import request from "supertest";
import usersRouter from "../../src/routes/users";

describe("Users Routes", () => {
  let app: Subatom;

  beforeEach(() => {
    app = new Subatom();
    app.use("/users", usersRouter);
  });

  describe("GET /users", () => {
    it("should return list of users", async () => {
      const response = await request(app.raw)
        .get("/users")
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it("should filter by email", async () => {
      const response = await request(app.raw)
        .get("/users?email=john@example.com")
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].email).toBe("john@example.com");
    });
  });

  describe("POST /users", () => {
    it("should create user", async () => {
      const response = await request(app.raw)
        .post("/users")
        .send({
          email: "newuser@example.com",
          name: "New User",
        })
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body.email).toBe("newuser@example.com");
    });

    it("should validate email format", async () => {
      const response = await request(app.raw)
        .post("/users")
        .send({
          email: "invalid-email",
          name: "User",
        })
        .expect(422);

      expect(response.body).toHaveProperty("error");
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });
  });
});
```

### Testing Middleware

```typescript
// tests/middleware/auth.test.ts
import { describe, it, expect, vi } from "vitest";
import { Subatom } from "subatom";
import request from "supertest";
import { requireAuth } from "../../src/middleware/auth";

describe("Auth Middleware", () => {
  let app: Subatom;

  beforeEach(() => {
    app = new Subatom();
    app.use(requireAuth);
    app.get("/protected", {
      controller: (ctx) => {
        ctx.res.json({ message: "Protected resource", user: ctx.user });
      },
    });
  });

  it("should reject request without token", async () => {
    const response = await request(app.raw)
      .get("/protected")
      .expect(401);

    expect(response.body).toHaveProperty("error");
  });

  it("should accept request with valid token", async () => {
    const validToken = generateTestToken({ id: "user-1" });

    const response = await request(app.raw)
      .get("/protected")
      .set("Authorization", `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.user).toHaveProperty("id", "user-1");
  });

  it("should reject invalid token", async () => {
    const response = await request(app.raw)
      .get("/protected")
      .set("Authorization", "Bearer invalid-token")
      .expect(401);

    expect(response.body).toHaveProperty("error");
  });
});
```

### Testing Error Handlers

```typescript
// tests/errors/handlers.test.ts
import { describe, it, expect } from "vitest";
import { Subatom, NotFoundError, BadRequestError } from "subatom";
import request from "supertest";

describe("Error Handlers", () => {
  let app: Subatom;

  beforeEach(() => {
    app = new Subatom();

    app.get("/notfound", {
      controller: () => {
        throw new NotFoundError("Resource not found");
      },
    });

    app.get("/badrequest", {
      controller: () => {
        throw new BadRequestError("Invalid request");
      },
    });

    app.useError((err, req, res) => {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message, code: "NOT_FOUND" });
        return;
      }
      if (err instanceof BadRequestError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      res.status(500).json({ error: "Internal Server Error" });
    });
  });

  it("should handle NotFoundError", async () => {
    const response = await request(app.raw)
      .get("/notfound")
      .expect(404);

    expect(response.body.code).toBe("NOT_FOUND");
  });

  it("should handle BadRequestError", async () => {
    const response = await request(app.raw)
      .get("/badrequest")
      .expect(400);

    expect(response.body.code).toBe("BAD_REQUEST");
  });
});
```

## Integration Testing

### End-to-End Route Testing

```typescript
// tests/integration/users.integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Subatom } from "subatom";
import request from "supertest";
import infer from "subatom-infer";

const userSchema = infer.object({
  id: infer.string(),
  email: infer.string().email(),
  name: infer.string(),
});

const mockDb = {
  users: [
    { id: "1", email: "john@example.com", name: "John Doe" },
  ],
  
  async getUsers() {
    return this.users;
  },
  
  async getUserById(id: string) {
    return this.users.find(u => u.id === id);
  },
  
  async createUser(data: any) {
    const user = { id: String(Date.now()), ...data };
    this.users.push(user);
    return user;
  },
};

describe("Users Integration Tests", () => {
  let app: Subatom;

  beforeEach(() => {
    app = new Subatom();

    app.get("/users", {
      controller: async (ctx) => {
        const users = await mockDb.getUsers();
        ctx.res.json(users);
      },
    });

    app.get("/users/:id", {
      schema: { params: infer.object({ id: infer.string() }) },
      controller: async (ctx) => {
        const user = await mockDb.getUserById(ctx.params.id);
        if (!user) {
          ctx.res.status(404).json({ error: "Not found" });
          return;
        }
        ctx.res.json(user);
      },
    });

    app.post("/users", {
      schema: {
        body: infer.object({
          email: infer.string().email(),
          name: infer.string(),
        }),
      },
      controller: async (ctx) => {
        const user = await mockDb.createUser(ctx.body);
        ctx.res.status(201).json(user);
      },
    });
  });

  it("should complete full user lifecycle", async () => {
    // Create user
    const createRes = await request(app.raw)
      .post("/users")
      .send({ email: "jane@example.com", name: "Jane Doe" })
      .expect(201);

    const userId = createRes.body.id;
    expect(createRes.body).toMatchObject({
      email: "jane@example.com",
      name: "Jane Doe",
    });

    // Get user
    const getRes = await request(app.raw)
      .get(`/users/${userId}`)
      .expect(200);

    expect(getRes.body).toMatchObject({
      id: userId,
      email: "jane@example.com",
      name: "Jane Doe",
    });

    // List users includes new user
    const listRes = await request(app.raw)
      .get("/users")
      .expect(200);

    expect(listRes.body).toHaveLength(2);
    expect(listRes.body).toContainEqual(expect.objectContaining({
      id: userId,
      email: "jane@example.com",
    }));
  });
});
```

### Database Integration Tests

```typescript
// tests/integration/database.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://localhost/test_db",
});

describe("Database Integration", () => {
  beforeEach(async () => {
    // Setup test database
    await pool.query(`
      DROP TABLE IF EXISTS users CASCADE;
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR UNIQUE NOT NULL,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  });

  afterEach(async () => {
    await pool.query("DROP TABLE IF EXISTS users CASCADE");
  });

  it("should insert and retrieve users", async () => {
    // Insert
    const result = await pool.query(
      "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *",
      ["john@example.com", "John Doe"]
    );

    const userId = result.rows[0].id;

    // Retrieve
    const retrieved = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [userId]
    );

    expect(retrieved.rows[0]).toMatchObject({
      email: "john@example.com",
      name: "John Doe",
    });
  });
});
```

## Snapshot Testing

```typescript
// tests/responses.test.ts
import { describe, it, expect } from "vitest";
import { Subatom } from "subatom";
import request from "supertest";

describe("Response Snapshots", () => {
  let app: Subatom;

  beforeEach(() => {
    app = new Subatom();
    app.get("/config", {
      controller: (ctx) => {
        ctx.res.json({
          version: "1.0.0",
          features: ["auth", "logging", "validation"],
        });
      },
    });
  });

  it("should match config snapshot", async () => {
    const response = await request(app.raw)
      .get("/config")
      .expect(200);

    expect(response.body).toMatchSnapshot();
  });
});
```

## Mocking

### Mocking External Services

```typescript
// tests/services/payment.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Subatom } from "subatom";
import request from "supertest";

// Mock Stripe
const mockStripe = {
  createPaymentIntent: vi.fn(),
};

vi.mock("stripe", () => ({
  Stripe: () => mockStripe,
}));

describe("Payment Service", () => {
  let app: Subatom;

  beforeEach(() => {
    app = new Subatom();
    vi.clearAllMocks();
  });

  it("should create payment intent", async () => {
    mockStripe.createPaymentIntent.mockResolvedValue({
      id: "pi_test",
      amount: 1000,
      status: "succeeded",
    });

    app.post("/payments", {
      controller: async (ctx) => {
        const intent = await mockStripe.createPaymentIntent({
          amount: ctx.body.amount,
        });
        ctx.res.json(intent);
      },
    });

    const response = await request(app.raw)
      .post("/payments")
      .send({ amount: 1000 })
      .expect(200);

    expect(response.body.id).toBe("pi_test");
    expect(mockStripe.createPaymentIntent).toHaveBeenCalledWith({
      amount: 1000,
    });
  });
});
```

## Parametrized Testing

```typescript
// tests/validation/email.test.ts
import { describe, it, expect } from "vitest";
import infer from "subatom-infer";

const emailSchema = infer.string().email();

describe("Email Validation", () => {
  const testCases = [
    { email: "valid@example.com", valid: true },
    { email: "user+tag@example.co.uk", valid: true },
    { email: "invalid.email@", valid: false },
    { email: "spaces in@example.com", valid: false },
    { email: "@example.com", valid: false },
  ];

  testCases.forEach(({ email, valid }) => {
    it(`should ${valid ? "accept" : "reject"} "${email}"`, () => {
      const result = emailSchema.safeParse(email);
      expect(result.success).toBe(valid);
    });
  });
});
```

## Performance Testing

```typescript
// tests/performance/routes.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Subatom } from "subatom";
import request from "supertest";

describe("Performance Tests", () => {
  let app: Subatom;

  beforeEach(() => {
    app = new Subatom();
    app.get("/fast", {
      controller: (ctx) => {
        ctx.res.json({ message: "Fast" });
      },
    });
  });

  it("should respond quickly", async () => {
    const start = Date.now();

    await request(app.raw)
      .get("/fast")
      .expect(200);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);  // Less than 100ms
  });

  it("should handle concurrent requests", async () => {
    const promises = Array.from({ length: 100 }, () =>
      request(app.raw).get("/fast")
    );

    const start = Date.now();
    const responses = await Promise.all(promises);
    const duration = Date.now() - start;

    expect(responses).toHaveLength(100);
    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(duration).toBeLessThan(1000);  // 100 requests in less than 1s
  });
});
```

## Best Practices

### 1. Test File Organization

```
tests/
├── unit/
│   ├── routes/
│   ├── middleware/
│   └── services/
├── integration/
│   ├── database.test.ts
│   └── external-api.test.ts
├── fixtures/
│   ├── users.json
│   └── posts.json
└── setup.ts
```

### 2. Use Test Fixtures

```typescript
// tests/fixtures/users.ts
export const mockUsers = [
  { id: "1", email: "john@example.com", name: "John" },
  { id: "2", email: "jane@example.com", name: "Jane" },
];

// tests/routes/users.test.ts
import { mockUsers } from "../fixtures/users";
```

### 3. Clean Up After Tests

```typescript
afterEach(async () => {
  // Clean database
  await db.query("DELETE FROM users");
  
  // Reset mocks
  vi.clearAllMocks();
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific file
npm test -- tests/routes/users.test.ts

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage

# UI mode
npm test -- --ui
```

## Next Steps

- Learn [Best Practices](./best-practices.md)
- Explore [Error Handling](./error-handling.md)
- Read [Validation](./validation.md) guide
