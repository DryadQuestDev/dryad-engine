// Helper function to safely get nested properties
function getProperty(obj: any, path: string): any {
    // Also check for null
    return path.split('.').reduce((o, key) => (o && o[key] !== undefined && o[key] !== null) ? o[key] : undefined, obj);
}

export type Sifter = {
    id?: string, // if the object's id key has the value that matches the search, it passes
    search?: string, // if the object has any key with a value that matches the search, it passes
    key?: string, // if the object has a key that matches the search, it passes
    tag?:{ // if the specific key has all(logic and) or any one(logic or) of the specified values, it passes
      key: string,
      logic: 'and' | 'or',
      values: (string | number)[], // Allow numbers in tag values
    }[],
    selected?:{ // if the specific key has the value that equals one of the values provided, it passes
      key: string,
      values: (string | number)[], // Allow numbers in selected values
    }[],
    range?:{ // if the specific key has the value in range between the min and max values provided(included), it passes
      key: string,
      min?: number,
      max?: number,
    }[],
}

export class SifterManager<T extends Record<string, any>> {

    objs: T[] = [];

    setObj(objs: T[]) {
        this.objs = objs;
    }

   sift(sifter: Sifter): T[] {
    if (!this.objs || this.objs.length === 0) { // Explicitly check length too
        //console.log("[SifterManager] No objects to sift, returning empty array.");
        return [];
    }

    return this.objs.filter(obj => {
        const anyObj = obj as any; // Cast to any for dynamic property access

        // ID check
        if (sifter.id && (!anyObj.id || !String(anyObj.id).toLowerCase().includes(sifter.id.toLowerCase()))) {
            return false;
        }

        // Key check
        if (sifter.key) {
            const keyToCheck = sifter.key;
            const negateKey = keyToCheck.startsWith('!');
            const actualKey = negateKey ? keyToCheck.substring(1) : keyToCheck;
            const lowerCaseActualKey = actualKey.toLowerCase();

            if (negateKey) {
                // Check if the key exists and is NOT empty/null/undefined at the deep path
                let keyExistsAndNotEmpty = false;
                const value = getProperty(anyObj, actualKey); // Use getProperty
                // Check if value is considered "non-empty" (excluding 0)
                if (value !== undefined && value !== null) {
                    if (Array.isArray(value)) {
                        if (value.length > 0) {
                            keyExistsAndNotEmpty = true;
                        }
                    } else if (typeof value === 'object') { // Excludes null
                         if (Object.keys(value).length > 0) {
                            keyExistsAndNotEmpty = true;
                        }
                    } else if (typeof value === 'string') {
                         if (value !== '') { // Non-empty string
                            keyExistsAndNotEmpty = true;
                         }
                    } else if (typeof value === 'number') {
                         if (value !== 0) { // Non-zero number
                            keyExistsAndNotEmpty = true;
                         }
                    } else if (typeof value === 'boolean') { 
                         if(value !== false){
                            keyExistsAndNotEmpty = true; 
                         }
                    }
                    // Other primitive types could be added here if needed
                }
                // If the key exists and is considered non-empty, it fails the negated check
                if (keyExistsAndNotEmpty) {
                    return false;
                }
            } else {
                // New logic: Check if a key exists at the exact path
                const value = getProperty(anyObj, lowerCaseActualKey);
                if (value === undefined || value === null || value === '' || value === false) {
                    return false;
                }
            }
        }

        // Search check (any value)
        if (sifter.search) {
            let valueFound = false;
            for (const objKey in obj) {
                if (anyObj.hasOwnProperty(objKey) && anyObj[objKey] !== null && anyObj[objKey] !== undefined) {
                    if (String(anyObj[objKey]).toLowerCase().includes(sifter.search.toLowerCase())) {
                        valueFound = true;
                        break;
                    }
                }
            }
            if (!valueFound) {
                return false;
            }
        }

        // Tag check
        if (sifter.tag) {
            for (const tagCondition of sifter.tag) {
                const objValue = getProperty(anyObj, tagCondition.key); // Use getProperty
                //console.log(`[SifterManager Tag Check] Object ID: ${anyObj.id}, Key: ${tagCondition.key}, Raw Value:`, objValue); // Log raw value

                if (!Array.isArray(objValue)) {
                    //console.log(`[SifterManager Tag Check] Value is not an array for key ${tagCondition.key}. Filtering out.`);
                    return false; // Tag key must point to an array
                }
                const conditionValues = tagCondition.values; // Filter values selected by user

                // Prepare objValue elements for comparison (lowercase & trim strings, keep numbers as is)
                const comparableObjValues = objValue.map(v => typeof v === 'string' ? v.toLowerCase().trim() : v);

               // console.log(`[SifterManager Tag Check] Comparable Object Values:`, comparableObjValues);
               // console.log(`[SifterManager Tag Check] Filter Condition:`, tagCondition);

                const checkFn = (conditionVal: string | number) => {
                    // Prepare filter value for comparison (lowercase & trim strings)
                    const comparisonVal = typeof conditionVal === 'string' ? conditionVal.toLowerCase().trim() : conditionVal;
                    const includesResult = comparableObjValues.includes(comparisonVal);
                    // console.log(`[SifterManager Tag Check] Checking if ${JSON.stringify(comparableObjValues)} includes ${JSON.stringify(comparisonVal)} -> ${includesResult}`); // Verbose log
                    return includesResult;
                };

                if (tagCondition.logic === 'and') {
                    const everyResult = conditionValues.every(checkFn);
                 //   console.log(`[SifterManager Tag Check] Logic: AND, Result: ${everyResult}`);
                    if (!everyResult) {
                        return false;
                    }
                } else if (tagCondition.logic === 'or') {
                    const someResult = conditionValues.some(checkFn);
                   // console.log(`[SifterManager Tag Check] Logic: OR, Result: ${someResult}`);
                    if (!someResult) {
                        return false;
                    }
                } else {
                  //  console.log(`[SifterManager Tag Check] Invalid logic: ${tagCondition.logic}`);
                    return false; // Invalid logic
                }
            }
        }

        // Selected check
        if (sifter.selected) {
            for (const selectedCondition of sifter.selected) {
                const objValue = getProperty(anyObj, selectedCondition.key); // Use getProperty
               // console.log(`[SifterManager Selected Check] Object ID: ${anyObj.id}, Key: ${selectedCondition.key}, Raw Value:`, objValue);

                if (objValue === null || objValue === undefined) {
               //   console.log(`[SifterManager Selected Check] Value is null/undefined for key ${selectedCondition.key}. Filtering out.`);
                  return false; // Value doesn't exist
                }

                const lowerCaseObjValueStr = String(objValue).toLowerCase();
                const conditionValues = selectedCondition.values;
              //  console.log(`[SifterManager Selected Check] Filter Condition Values:`, conditionValues);

                const match = conditionValues.some(conditionVal => {
                    let currentMatch = false;
                    if (typeof conditionVal === 'string') {
                        currentMatch = lowerCaseObjValueStr === conditionVal.toLowerCase();
                        // console.log(`[SifterManager Selected Check] Comparing ${lowerCaseObjValueStr} === ${conditionVal.toLowerCase()} -> ${currentMatch}`);
                    } else if (typeof conditionVal === 'number') {
                        currentMatch = typeof objValue === 'number' && objValue === conditionVal;
                        // console.log(`[SifterManager Selected Check] Comparing ${objValue} === ${conditionVal} -> ${currentMatch}`);
                    }
                    return currentMatch;
                });

               // console.log(`[SifterManager Selected Check] Match found: ${match}`);
                if (!match) {
                  //  console.log(`[SifterManager Selected Check] No match found for condition. Filtering out.`);
                    return false;
                }
            }
        }

        // Range check
        if (sifter.range) {
            for (const rangeCondition of sifter.range) {
                let objValue = getProperty(anyObj, rangeCondition.key); // Use getProperty

                // Attempt conversion if not already a number
                if (typeof objValue !== 'number') {
                    const numValue = Number(objValue);
                    if (isNaN(numValue)) {
                        // If conversion fails (NaN), it's not a valid number for range check
                         return false;
                    }
                    objValue = numValue; // Use the converted number
                }

                // Now objValue is guaranteed to be a number (or the loop was exited)
                const { min, max } = rangeCondition;
                if (min !== undefined && objValue < min) {
                    return false;
                }
                if (max !== undefined && objValue > max) {
                    return false;
                }
            }
        }

        // If all checks passed
        return true;
    });
   }




}