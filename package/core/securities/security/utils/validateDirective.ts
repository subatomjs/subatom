import { InvalidDirectiveError } from '../security.errors.js';

export function validateDirectiveName(name: string): void {
  if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9-]+$/.test(name)) {
    throw new InvalidDirectiveError(`Invalid directive name: "${name}"`);
  }
}