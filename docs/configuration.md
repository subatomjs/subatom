# Configuration

Subatom loads configuration from multiple sources (files, environment variables, runtime) with automatic validation and merging.

## Configuration Basics

Configuration is resolved from three sources in order:

1. **Default Configuration** - Built-in defaults
2. **File Configuration** - From `subatom.config.js/ts` or `.subatomrc`
3. **Environment Overrides** - From environment variables
4. **Runtime Overrides** - From `setConfig()` calls

### Configuration File

Create `subatom.config.ts` in your project root:

```typescript
// subatom.config.ts
export default {
  entry: "src/index.ts",
  outDir: "dist",
  port: 3000,
  host: "0.0.0.0",
  sourcemap: true,
  minify: false,
  watch: {
    extensions: ["ts", "js"],
    debounceMs: 300,
    ignore: ["node_modules", "dist"],
  },
};
```

Or JavaScript:

```javascript
// subatom.config.js
module.exports = {
  entry: "src/index.js",
  outDir: "dist",
  port: 3000,
  // ...
};
```

Or JSON:

```json
{
  "entry": "src/index.ts",
  "outDir": "dist",
  "port": 3000,
  "host": "0.0.0.0",
  "sourcemap": true,
  "minify": false
}
```

## Configuration Schema

### SubatomConfig Interface

```typescript
interface SubatomConfig {
  // Entry point
  entry: string;                    // e.g., "src/index.ts"
  
  // Output directory
  outDir: string;                   // e.g., "dist"
  
  // Server
  port: number;                     // Default: 3000
  host: string;                     // Default: "0.0.0.0"
  
  // Build
  sourcemap: boolean;               // Default: true (dev), false (prod)
  minify: boolean;                  // Default: false (dev), true (prod)
  
  // Watching
  watch: {
    extensions: string[];           // e.g., ["ts", "js"]
    debounceMs: number;             // Default: 300
    ignore: string[];               // e.g., ["node_modules", "dist"]
  };
}
```

## Environment Variables

Override config via environment variables with `SUBATOM_` prefix:

```bash
# Port
SUBATOM_PORT=8080

# Host
SUBATOM_HOST=localhost

# Entry point
SUBATOM_ENTRY=src/app.ts

# Output directory
SUBATOM_OUT_DIR=build

# Minification
SUBATOM_MINIFY=true

# Sourcemaps
SUBATOM_SOURCEMAP=false
```

### Environment File

Load environment from `.env` files:

```bash
# .env
SUBATOM_PORT=3000
SUBATOM_HOST=0.0.0.0
DATABASE_URL=postgres://localhost/mydb
API_KEY=secret123
```

Custom env file path:

```typescript
const app = new Subatom({
  envPath: ".env.production",
});
```

## Runtime Configuration

### setConfig Method

```typescript
const app = new Subatom();

app.setConfig({
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
});

await app.listen();
```

### Using ConfigManager

```typescript
import { ConfigManager } from "subatom";

// Resolve config with runtime overrides
const config = await ConfigManager.resolve({
  port: 8080,
  minify: true,
});

// Get cached config
const cached = ConfigManager.get();
```

## Configuration Priority

When the same setting is defined in multiple sources, priority is:

1. Runtime overrides (highest)
2. Environment variables
3. Configuration file
4. Defaults (lowest)

```typescript
// defaults
port: 3000

// subatom.config.ts
port: 8080

// Environment: SUBATOM_PORT=9000
// Result: 9000 (environment wins)

// Runtime
app.setConfig({ port: 5000 });
// Result: 5000 (runtime wins)
```

## Build Configuration

### Entry Point

Specify the application entry files:

```typescript
// subatom.config.ts
export default {
  entry: "src/index.ts",  // Resolved relative to project root
};
```

### Output Directory

Where compiled code is written:

```typescript
export default {
  outDir: "dist",  // Build output
  // Generates:
  // dist/index.js
  // dist/index.d.ts
  // dist/[other files]
};
```

### Sourcemaps

Include source maps for debugging:

```typescript
export default {
  sourcemap: true,  // In development
  // Generates .map files
};
```

### Minification

Minify code for production:

```typescript
export default {
  minify: false,   // In development
  // In production, enable for smaller bundle
};
```

## Watch Configuration

### File Extensions

Which files to watch for changes:

```typescript
export default {
  watch: {
    extensions: ["ts", "tsx", "js", "jsx", "json"],
  },
};
```

### Debounce

Delay before rebuilding after file change:

```typescript
export default {
  watch: {
    debounceMs: 300,  // Wait 300ms for more changes
  },
};
```

### Ignore Patterns

Files/directories to exclude from watching:

```typescript
export default {
  watch: {
    ignore: [
      "node_modules",
      "dist",
      ".git",
      "*.test.ts",
      "**/*.log",
    ],
  },
};
```

## Production Configuration

### Environment-Based Config

```typescript
// subatom.config.ts
const isDev = process.env.NODE_ENV === "development";

export default {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || (isDev ? "localhost" : "0.0.0.0"),
  
  sourcemap: isDev,
  minify: !isDev,
  
  watch: {
    extensions: ["ts"],
    debounceMs: isDev ? 300 : undefined,  // Only watch in dev
    ignore: ["node_modules", "dist"],
  },
};
```

### Server Configuration

```typescript
const app = new Subatom();

app.setConfig({
  // Port from environment or default
  port: parseInt(process.env.PORT || "3000", 10),
  
  // Host - 0.0.0.0 in production to listen on all interfaces
  host: process.env.HOST || "0.0.0.0",
  
  // Trust proxy headers (X-Forwarded-For, etc.)
  trustProxy: process.env.TRUST_PROXY === "true",
  
  // Request limits
  maxRequestSize: "100kb",
  
  // Concurrency
  maxConcurrentRequests: 1000,
  
  // Timeouts
  requestTimeout: 30000,
  socketTimeout: 120000,
});
```

## Loading Config Programmatically

### During Startup

```typescript
const app = new Subatom();

// Load configuration from file/env/runtime
const config = await ConfigManager.resolve({
  port: parseInt(process.env.PORT || "3000", 10),
});

app.setConfig({
  port: config.port,
  host: config.host,
});

await app.listen();
```

### Access Resolved Config

```typescript
import { ConfigManager } from "subatom";

// After resolution
const config = ConfigManager.get();
console.log(config.port);      // 3000
console.log(config.entry);     // "src/index.ts"
console.log(config.sourcemap); // true
```

## Best Practices

### 1. Use Environment Variables for Secrets

```typescript
// subatom.config.ts
export default {
  port: 3000,
  // Don't put secrets here!
};

// In code
const dbUrl = process.env.DATABASE_URL;
const apiKey = process.env.API_KEY;
```

### 2. Environment-Specific Configs

```typescript
// subatom.config.ts
const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

export default {
  port: isProd ? 80 : 3000,
  host: isProd ? "0.0.0.0" : "localhost",
  sourcemap: !isProd,
  minify: isProd,
};
```

### 3. Validation on Load

```typescript
const app = new Subatom();

const port = parseInt(process.env.PORT || "3000", 10);
if (port < 1 || port > 65535) {
  throw new Error("Invalid port number");
}

app.setConfig({ port });
```

### 4. Use .env Files for Development

```bash
# .env (local development)
PORT=3000
DATABASE_URL=postgres://localhost/mydb
JWT_SECRET=dev-secret
```

```bash
# .env.production (production)
PORT=3000
DATABASE_URL=postgres://prod-server/mydb
JWT_SECRET=[generated-secret]
```

### 5. Document Configuration

```typescript
// subatom.config.ts
export default {
  // Application entry point
  entry: "src/index.ts",
  
  // Build output directory
  outDir: "dist",
  
  // Server port (can override with PORT env var)
  port: parseInt(process.env.PORT || "3000", 10),
  
  // Server host (0.0.0.0 for all interfaces)
  host: process.env.HOST || "0.0.0.0",
  
  // Include source maps in build (for debugging)
  sourcemap: process.env.NODE_ENV === "development",
  
  // Minify code in production
  minify: process.env.NODE_ENV === "production",
  
  // File watching config for development
  watch: {
    extensions: ["ts", "tsx", "js"],
    debounceMs: 300,
    ignore: ["node_modules", "dist", ".git"],
  },
};
```

## Common Pitfalls

### ❌ Hardcoding Secrets

```typescript
// Wrong
export default {
  databaseUrl: "postgres://user:password@localhost/db",
  apiKey: "sk-1234567890",
};

// Correct
export default {
  databaseUrl: process.env.DATABASE_URL,
  apiKey: process.env.API_KEY,
};
```

### ❌ Not Handling Missing Env Vars

```typescript
// Wrong
const port = parseInt(process.env.PORT);
// NaN if PORT not set!

// Correct
const port = parseInt(process.env.PORT || "3000", 10);
```

### ❌ Type Mismatch

```typescript
// Wrong
const port = process.env.PORT;  // Always string!
// port is "3000", not 3000

// Correct
const port = parseInt(process.env.PORT || "3000", 10);
```

## CLI Integration

Subatom's CLI reads configuration automatically:

```bash
# Uses config from subatom.config.ts
npx subatom dev
npx subatom build
npx subatom start

# Override with environment
PORT=8080 npx subatom dev

# Custom config file
SUBATOM_CONFIG=custom.config.ts npx subatom build
```

## Next Steps

- Learn about [Middleware](./middleware.md) for custom logic
- Explore [Error Handling](./error-handling.md)
- Implement [Logging](./logging.md) with configuration
- Read [Production Best Practices](./best-practices.md)
