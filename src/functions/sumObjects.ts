export const sumObjects = (objects:any, excludeFields= []): any => {
  const result = {};
  const valuesOverwrite = ['dmgType'];

  function shouldExcludeKey(keyPath: string, excludeFields:any): boolean {
    // @ts-ignore
    return excludeFields.some(excludeField => excludeField === keyPath);
  }

  function mergeRecursive(target:any, obj:any, parentKeyPath: string = ''): void {
    for (const key in obj) {
      const keyPath = parentKeyPath ? `${parentKeyPath}.${key}` : key;

      if (!shouldExcludeKey(keyPath, excludeFields)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (Array.isArray(obj[key])) {
            target[key] = (target[key] as any[] || []).concat(obj[key] as any[]);
          } else {
            if (!target.hasOwnProperty(key)) {
              target[key] = {};
            }
            mergeRecursive(target[key], obj[key], keyPath);
          }
        } else {
          target[key] = (target[key] || 0);
          if(obj[key]){
            if(isNaN(obj[key]) && target[key] === 0){
              target[key] = '';
            }
            if(valuesOverwrite.includes(key)){
              target[key] = obj[key];
            }else{
              target[key] = target[key] + obj[key];
            }
          }
        }
      } else {
        if (!target.hasOwnProperty(key)) {
          target[key] = obj[key];
        }
      }
    }
  }

  for (const obj of objects) {
    mergeRecursive(result, obj);
  }

  return result;
}

// Example usage
/*
const obj1: NestedObject = { a: { x: 1, y: 2 }, b: 2, c: 3, d: 10, g: [1, 2] };
const obj2: NestedObject = { a: { x: 4, z: 8 }, b: 6, c: 9, e: 20, g: [3, 4] };
const obj3: NestedObject = { a: { y: 5 }, b: 4, c: 7, f: 15, g: [5, 6] };

const excludeFields: ExcludeFields = ['d', 'e', 'f', 'a.x'];
const mergedObj: NestedObject = mergeAndSumObjects([obj1, obj2, obj3], excludeFields);

console.log(mergedObj); // Output: { a: { x: 1, y: 7, z: 8 }, b: 12, c: 19, d: 10, e: 20, f: 15, g: [ 1, 2, 3, 4, 5, 6 ] }
*/
