export interface SlugOptions {
  /** Character(s) used to join words. Defaults to '-'. */
  separator?: string;
  /** Lowercase the result. Defaults to true. */
  lowercase?: boolean;
  /** Truncate the result to this many characters. */
  maxLength?: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a string into a URL-friendly slug: strips diacritics/accents,
 * replaces runs of non-alphanumeric characters with a separator, and
 * trims leading/trailing separators.
 *
 * @example
 * slug('Hello, World!')              // 'hello-world'
 * slug('Café déjà vu')                // 'cafe-deja-vu'
 * slug('Node.js & TypeScript', { separator: '_' })  // 'node_js_typescript'
 */
export function slug(input: string, options: SlugOptions = {}): string {
  const { separator = '-', lowercase = true, maxLength } = options;
  const sep = escapeRegExp(separator);

  let result = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .replace(/[^a-zA-Z0-9]+/g, separator)
    .replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '')
    .replace(new RegExp(`${sep}{2,}`, 'g'), separator);

  if (lowercase) result = result.toLowerCase();

  if (maxLength && result.length > maxLength) {
    result = result.slice(0, maxLength).replace(new RegExp(`${sep}+$`), '');
  }

  return result;
}