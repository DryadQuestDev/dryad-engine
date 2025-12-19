import { ComputedRef, Ref } from 'vue';

/**
 * Custom JSON serializer that handles special JavaScript types that don't serialize well with JSON.stringify()
 * - Converts Set objects to Arrays
 * - Converts Map objects to Objects
 * - Extracts values from Vue Ref and ComputedRef objects
 *
 * @param obj - The object to serialize
 * @param space - Number of spaces for indentation (default: 2)
 * @returns JSON string representation
 */
export function debugSerialize(obj: any, space: number = 2): string {
  return JSON.stringify(obj, createDebugReplacer(), space);
}

/**
 * Creates a replacer function for JSON.stringify that handles special types
 */
function createDebugReplacer() {
  const seen = new WeakSet();

  return function(key: string, value: any): any {
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }

    // Convert Set to Array
    if (value instanceof Set) {
      return Array.from(value);
    }

    // Convert Map to Object
    if (value instanceof Map) {
      const obj: Record<string, any> = {};
      value.forEach((val, key) => {
        obj[String(key)] = val;
      });
      return obj;
    }

    // Extract value from Vue Ref
    if (value && typeof value === 'object' && '__v_isRef' in value) {
      return (value as Ref).value;
    }

    // Extract value from Vue ComputedRef
    if (value && typeof value === 'object' && '__v_isReadonly' in value && '__v_isRef' in value) {
      return (value as ComputedRef).value;
    }

    // Skip functions (they don't serialize anyway, but this makes it explicit)
    if (typeof value === 'function') {
      return '[Function]';
    }

    return value;
  };
}
