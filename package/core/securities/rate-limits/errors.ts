// src/rate-limit/errors.ts
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class RateLimitConfigError extends RateLimitError {
  constructor(message: string) {
    super(`[RateLimit Config Error]: ${message}`);
  }
}

export class RateLimitStoreError extends RateLimitError {
  constructor(message: string) {
    super(`[RateLimit Store Error]: ${message}`);
  }
}
