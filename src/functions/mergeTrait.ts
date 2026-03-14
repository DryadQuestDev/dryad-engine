import { deepMerge } from './mergeById';

/**
 * Merges two trait values based on the trait's schema type.
 * - chooseMany: array union (deduplicate)
 * - array: concatenate (preserve duplicates)
 * - schema: deep merge objects
 * - other: last wins (returns incoming)
 */
export function mergeTrait(existing: any, incoming: any, traitType: string): any {
  if (traitType === 'chooseMany' && Array.isArray(existing) && Array.isArray(incoming)) {
    const merged = [...existing];
    for (const item of incoming) {
      if (!merged.includes(item)) merged.push(item);
    }
    return merged;
  }

  if (traitType === 'array' && Array.isArray(existing) && Array.isArray(incoming)) {
    return [...existing, ...incoming];
  }

  if (traitType === 'schema'
      && existing && typeof existing === 'object' && !Array.isArray(existing)
      && incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    return deepMerge(existing, incoming);
  }

  // Fallback: last wins
  return incoming;
}
