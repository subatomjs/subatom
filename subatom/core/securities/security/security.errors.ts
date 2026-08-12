export class SubatomSecurityError extends Error {
  constructor(message: string) {
    super(`[Subatom Security]: ${message}`);
    this.name = 'SubatomSecurityError';
  }
}

export class InvalidDirectiveError extends SubatomSecurityError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDirectiveError';
  }
}

export class InvalidConfigurationError extends SubatomSecurityError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConfigurationError';
  }
}