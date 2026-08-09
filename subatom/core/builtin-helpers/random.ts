import { randomInt, randomBytes } from "crypto";

const DEFAULT_CHARSET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generate a random number. If both bounds are integers, returns a
 * cryptographically-strong random integer in [min, max] (inclusive).
 * Otherwise returns a random float in [min, max).
 *
 * @example
 * random()          // float between 0 and 1
 * random(1, 10)     // random integer 1-10 inclusive
 */
export function random(min = 0, max = 1): number {
  if (Number.isInteger(min) && Number.isInteger(max)) {
    return randomInt(min, max + 1);
  }
  return Math.random() * (max - min) + min;
}

/** Random integer in [min, max], inclusive on both ends. */
random.int = function int(min: number, max: number): number {
  return randomInt(min, max + 1);
};

/** Random alphanumeric (or custom charset) string of the given length. */
random.string = function string(
  length = 16,
  charset: string = DEFAULT_CHARSET,
): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += charset.charAt((bytes[i] as any) % charset.length);
  }
  return out;
};

/** Random boolean, optionally weighted by `probability` of returning true. */
random.bool = function bool(probability = 0.5): boolean {
  return Math.random() < probability;
};

/** Pick a random element from a non-empty array. */
random.item = function item<T>(arr: readonly T[]): T {
  if (arr.length === 0)
    throw new Error("random.item() called with an empty array");
  const index = randomInt(0, arr.length);
  return arr[index]!;
};

/** Return a new array with elements shuffled (Fisher–Yates). */
random.shuffle = function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
};
