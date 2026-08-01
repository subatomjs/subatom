// // config/env.ts
// import fs from "node:fs";
// import path from "node:path";

// export interface EnvOptions {
//   path?: string; // Path to .env file (default: ".env")
//   encoding?: BufferEncoding; // Default: "utf-8"
//   override?: boolean; // Override existing process.env variables (default: false)
// }

// /**
//  * Parses raw .env string into key-value object
//  */
// export function parseEnv(src: string): Record<string, string> {
//   const obj: Record<string, string> = {};

//   // Split by line breaks
//   const lines = src.toString().split(/\r\n|\n|\r/);

//   for (const line of lines) {
//     // Trim leading/trailing whitespace
//     const trimmedLine = line.trim();

//     // Ignore empty lines and comments (#)
//     if (!trimmedLine || trimmedLine.startsWith("#")) {
//       continue;
//     }

//     // Match KEY=VALUE pairs
//     const keyValueMatch = trimmedLine.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);

//     if (keyValueMatch) {
//       const key = keyValueMatch[1]!;
//       let value = keyValueMatch[2] || "";

//       // Remove surrounding quotes ("value" or 'value')
//       value = value.trim();
//       const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
//       const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');

//       if (isSingleQuoted || isDoubleQuoted) {
//         value = value.slice(1, -1);
//       }

//       // Handle unescaped newlines in double quotes
//       if (isDoubleQuoted) {
//         value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
//       }

//       obj[key] = value;
//     }
//   }

//   return obj;
// }

// /**
//  * Loads .env file into process.env
//  */
// export function configEnv(options: EnvOptions = {}): Record<string, string> {
//   const envPath = path.resolve(process.cwd(), options.path ?? ".env");
//   const encoding = options.encoding ?? "utf-8";
//   const override = options.override ?? false;

//   try {
//     if (!fs.existsSync(envPath)) {
//       return {};
//     }

//     const envContent = fs.readFileSync(envPath, { encoding });
//     const parsed = parseEnv(envContent);

//     for (const [key, val] of Object.entries(parsed)) {
//       // Only set if process.env doesn't already have it, or if override is true
//       if (override || process.env[key] === undefined) {
//         process.env[key] = val;
//       }
//     }

//     return parsed;
//   } catch (error) {
//     console.warn(
//       `[Subatom Env Warning]: Failed to load env file from ${envPath}`,
//     );
//     return {};
//   }
// }

// config/env.ts
import fs from "node:fs";
import path from "node:path";

export interface EnvOptions {
  path?: string; // Path to .env file (default: ".env")
  encoding?: BufferEncoding; // Default: "utf-8"
  override?: boolean; // Override existing process.env variables (default: false)
}

/**
 * Parses raw .env string into key-value object
 */
export function parseEnv(src: string): Record<string, string> {
  const obj: Record<string, string> = {};

  // Split by line breaks
  const lines = src.toString().split(/\r\n|\n|\r/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Ignore empty lines and comments (#)
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    // Match KEY=VALUE pairs
    const keyValueMatch = trimmedLine.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);

    if (keyValueMatch) {
      const key = keyValueMatch[1]!;
      let value = keyValueMatch[2] || "";

      value = value.trim();
      const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
      const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');

      if (isSingleQuoted || isDoubleQuoted) {
        value = value.slice(1, -1);
      }

      if (isDoubleQuoted) {
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      }

      obj[key] = value;
    }
  }

  return obj;
}

/**
 * Loads .env file into process.env
 */
export function configEnv(options: EnvOptions = {}): Record<string, string> {
  const envPath = path.resolve(process.cwd(), options.path ?? ".env");
  const encoding = options.encoding ?? "utf-8";
  const override = options.override ?? false;

  try {
    if (!fs.existsSync(envPath)) {
      return {};
    }

    const envContent = fs.readFileSync(envPath, { encoding });
    const parsed = parseEnv(envContent);

    for (const [key, val] of Object.entries(parsed)) {
      if (override || process.env[key] === undefined) {
        process.env[key] = val;
      }
    }

    return parsed;
  } catch (error) {
    console.warn(
      `[Subatom Env Warning]: Failed to load env file from ${envPath}`
    );
    return {};
  }
}

// Automatically initialize .env on module load
configEnv();

/**
 * Environment helpers for Subatom framework internals
 */
export const env = {
  get NODE_ENV(): string {
    return process.env.NODE_ENV || "development";
  },
  get isDev(): boolean {
    return this.NODE_ENV === "development";
  },
  get isProd(): boolean {
    return this.NODE_ENV === "production";
  },
  get isTest(): boolean {
    return this.NODE_ENV === "test";
  },
  get(key: string, defaultValue: string = ""): string {
    return process.env[key] ?? defaultValue;
  },
};
