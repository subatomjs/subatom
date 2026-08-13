export function mergeConfig<T extends Record<string, any>>(target: T, source?: Partial<T>): T {
  if (!source) return { ...target };
  const result: any = { ...target };

  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = mergeConfig(result[key] || {}, val);
    } else if (val !== undefined) {
      result[key] = val;
    }
  }

  return result;
}