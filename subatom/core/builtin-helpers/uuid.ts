import { randomUUID, randomBytes } from 'crypto';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Generate a random RFC 4122 v4 UUID.
 *
 * @example
 * uuid()          // '3f9a1b2c-...'
 * uuid.short(10)  // 'a1b2c3d4e5'
 */
export function uuid(): string {
  return randomUUID();
}

uuid.v4 = uuid;

/**
 * Generate a short, non-RFC random hex id — handy for things like
 * request ids or short-lived tokens where a full UUID is overkill.
 */
uuid.short = function short(length = 8): string {
  return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

/** Check whether a string is a syntactically valid v4 UUID. */
uuid.isValid = function isValid(value: string): boolean {
  return UUID_V4_RE.test(value);
};