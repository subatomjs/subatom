/**
 * @fileoverview Security policy errors handlers.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */



export class SubatomSecurityError extends Error {
  constructor(message: string) {
    super(`[Subatom Security]: ${message}`);
    this.name = "SubatomSecurityError";
  }
}

export class InvalidDirectiveError extends SubatomSecurityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDirectiveError";
  }
}

export class InvalidConfigurationError extends SubatomSecurityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConfigurationError";
  }
}
