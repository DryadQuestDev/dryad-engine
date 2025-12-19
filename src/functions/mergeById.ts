function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = { ...target };
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          result[key] = deepMerge(targetValue, sourceValue);
        } else if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
          // Check if arrays contain objects with 'id' property
          const targetHasIds = targetValue.some((item: any) => item && typeof item === 'object' && 'id' in item);
          const sourceHasIds = sourceValue.some((item: any) => item && typeof item === 'object' && 'id' in item);

          if (targetHasIds || sourceHasIds) {
            // Merge arrays by ID, preserving items without IDs
            const mergedMap = new Map<string | number, any>();
            const itemsWithoutIds: any[] = [];

            // Add target items
            for (const item of targetValue) {
              if (item && typeof item === 'object' && item.id !== undefined && item.id !== null) {
                mergedMap.set(item.id, { ...item });
              } else {
                // Keep items without IDs
                itemsWithoutIds.push(item);
              }
            }

            // Merge or add source items
            for (const item of sourceValue) {
              if (item && typeof item === 'object' && item.id !== undefined && item.id !== null) {
                const id = item.id;
                if (mergedMap.has(id)) {
                  const existing = mergedMap.get(id)!;
                  mergedMap.set(id, deepMerge(existing, item));
                } else {
                  mergedMap.set(id, { ...item });
                }
              } else {
                // Keep items without IDs from source
                itemsWithoutIds.push(item);
              }
            }

            result[key] = [...Array.from(mergedMap.values()), ...itemsWithoutIds];
          } else {
            // If no items have IDs, concatenate as before
            result[key] = [...targetValue, ...sourceValue];
          }
        } else {
          result[key] = sourceValue;
        }
      }
    }
    return result;
  }

export interface Identifiable {
  id: string | number;
  [key: string]: any;
}

// Make the function generic with type T extending Identifiable
export function mergeById<T extends Identifiable>(...arrays: T[][]): T[] {
  // Use type T for the Map value
  const mergedMap = new Map<string | number, T>();

  for (const array of arrays) {
    // Filter out any potential non-array inputs just in case
    if (!Array.isArray(array)) continue;

    for (const obj of array) {
      // Ensure obj is an object and has a valid id
      if (obj && typeof obj === 'object' && obj.id !== undefined && obj.id !== null) {
        const id = obj.id;
        if (mergedMap.has(id)) {
          const existing = mergedMap.get(id)!;
          // Perform deep merge. Both existing (T) and obj (T) are compatible with Record<string, any>
          const mergedObj = deepMerge(existing, obj);
          // Explicitly ensure the id is correctly typed and present
          // Assert the resulting object as type T before setting it
          mergedMap.set(id, { ...mergedObj, id: id } as T);
        } else {
          // Set a copy of the object. { ...obj } creates a shallow copy of type T.
          mergedMap.set(id, { ...obj });
        }
      }
    }
  }

  // The values in the map are now of type T, so the return type is T[]
  return Array.from(mergedMap.values());
} 


/**
 * Deep merges an array of objects sequentially into a single object.
 * Objects later in the array will override properties of earlier objects.
 * Returns null if the input array is empty or not an array.
 *
 * @template T The type of objects in the array (must be object-like).
 * @param {T[]} objects The array of objects to merge.
 * @returns {T | null} The final merged object, or null if the input was invalid or empty.
 */
export function mergeObjectArraySequentially<T extends Record<string, any>>(objects: T[]): T | null {
  if (!Array.isArray(objects) || objects.length === 0) {
    console.warn("[mergeObjectArraySequentially] Input must be a non-empty array.");
    return null;
  }

  // Start with a deep copy of the first object to avoid modifying originals
  // Assert the result of deepMerge to T
  let result: T = deepMerge({}, objects[0]) as T; 

  // Merge subsequent objects into the result
  for (let i = 1; i < objects.length; i++) {
    // Ensure we are merging actual objects
    if (objects[i] && typeof objects[i] === 'object') {
       // Assert the result of deepMerge to T
       result = deepMerge(result, objects[i]) as T;
    }
  }

  return result;
} 