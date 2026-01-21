import { isRef, isReactive } from 'vue';

const skipMetadata = new WeakMap<any, Set<string>>();
// const populateMetadata = new WeakMap<any, Map<string, { itemConstructor: Function }>>();
// Store more info for population: constructor and mode
interface PopulateInfo {
    itemConstructor: Function;
    mode: 'replace' | 'update' | 'merge';
}
const populateMetadata = new WeakMap<any, Map<string, PopulateInfo>>();

export function Skip(): PropertyDecorator {
    return function (target: any, propertyKey: string | symbol) {
        const existing = skipMetadata.get(target) || new Set<string>();
        existing.add(propertyKey as string);
        skipMetadata.set(target, existing);
    };
}

export interface PopulateOptions {
    mode?: 'replace' | 'update' | 'merge';
}

export function Populate(itemConstructor: Function, options?: PopulateOptions): PropertyDecorator {
    return function (target: any, propertyKey: string | symbol) {
        const proto = target; // Directly use target, which is the prototype
        const mode = options?.mode || 'replace'; // Default to 'replace'

        const constructorName = typeof itemConstructor === 'function' ? itemConstructor.name : 'INVALID_CONSTRUCTOR';
        const targetName = target?.constructor?.name || 'UNKNOWN_TARGET';
        // console.log(`[SAVE_SYSTEM_DEBUG] @Populate: Decorator executing for ${targetName}.${String(propertyKey)} with constructor ${constructorName}, mode: ${mode}`);

        if (typeof itemConstructor !== 'function') {
            // console.error(`[SAVE_SYSTEM_DEBUG] @Populate: Invalid constructor provided for ${targetName}.${String(propertyKey)}`, itemConstructor);
            return;
        }

        const existingMap = populateMetadata.get(proto) || new Map<string, PopulateInfo>();
        existingMap.set(propertyKey as string, { itemConstructor, mode });
        populateMetadata.set(proto, existingMap);
    };
}

function isSkipped(obj: any, key: string): boolean {
    return skipMetadata.get(Object.getPrototypeOf(obj))?.has(key) ?? false;
}

function getCollectionPopulationInfo(obj: any, key: string): PopulateInfo | undefined {
    const proto = Object.getPrototypeOf(obj);
    const objName = obj?.constructor?.name || 'UNKNOWN_OBJECT';
    const metadataForPrototype = populateMetadata.get(proto);
    const info = metadataForPrototype?.get(key) as PopulateInfo | undefined;

    if (metadataForPrototype) {
        if (info && typeof info.itemConstructor === 'function') {
            // console.log(`[SAVE_SYSTEM_DEBUG] getCollectionPopulationInfo: SUCCESS - Found constructor '${info.itemConstructor.name}' (mode: ${info.mode}) for ${objName}.${key}`);
        } else {
            // console.log(`[SAVE_SYSTEM_DEBUG] getCollectionPopulationInfo: INFO - No specific population info found for ${objName}.${key} in metadata. Keys in metadata:`, metadataForPrototype ? Array.from(metadataForPrototype.keys()) : 'none');
        }
    } else {
        // console.log(`[SAVE_SYSTEM_DEBUG] getCollectionPopulationInfo: INFO - No metadata found for prototype of ${objName}.`);
    }
    return info;
}

function isSavableObject(obj: any): boolean {
    return obj && typeof obj === 'object' && !isRef(obj) && !isReactive(obj) && Object.getPrototypeOf(obj) !== Object.prototype;
}


function saveAny(value: any): any {
    if (isRef(value)) {
        const unwrappedValue = value.value;
        // Handle Ref<Map>
        if (unwrappedValue instanceof Map) {
            // // console.log('Saving Ref<Map>: ', unwrappedValue);
            const result: any = {};
            for (const [entryKey, entryValue] of unwrappedValue.entries()) {
                // Skip entries marked with skipSave (e.g., constant properties)
                if (entryValue && typeof entryValue === 'object' && entryValue.skipSave === true) {
                    continue;
                }
                result[String(entryKey)] = saveAny(entryValue);
            }
            return result;
        }
        // Handle Ref<Set>
        if (unwrappedValue instanceof Set) {
            // // console.log('Saving Ref<Set>: ', unwrappedValue);
            return Array.from(unwrappedValue).map(saveAny);
        }
        // For other Refs, recurse on the unwrapped value
        return saveAny(unwrappedValue);
    }

    // Handle direct Map (not in a Ref)
    if (value instanceof Map) {
        const result: any = {};
        for (const [entryKey, entryValue] of value.entries()) {
            // Skip entries marked with skipSave (e.g., constant properties)
            if (entryValue && typeof entryValue === 'object' && entryValue.skipSave === true) {
                continue;
            }
            result[String(entryKey)] = saveAny(entryValue);
        }
        return result;
    }

    // Handle direct Set (not in a Ref)
    if (value instanceof Set) {
        return Array.from(value).map(saveAny);
    }

    if (Array.isArray(value)) {
        return value.map(saveAny);
    }

    // isSavableObject is for custom class instances.
    // isReactive is for Vue's reactive objects (proxies).
    // Maps/Sets that are reactive should have been caught by `instanceof Map/Set` already.
    if (isSavableObject(value) || isReactive(value)) {
        return save(value); // save() iterates properties of an object.
    }

    // Handle plain objects (like DiscoveredCharacter) that might contain Maps/Sets
    if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
        return save(value); // Recursively serialize nested Maps/Sets
    }

    return value; // Primitives
}

export function save(obj: any): any {
    const result: any = {};
    for (const key of Object.keys(obj)) {
        if (isSkipped(obj, key)) continue;
        result[key] = saveAny(obj[key]);
    }
    return result;
}

export function load(target: any, data: any): void {
    type LoadableItem = {
        id?: any;
        loadState?: (...args: any[]) => void;
        [key: string]: any;
    };

    // Ensure target and data are valid objects
    if (typeof target !== 'object' || target === null || typeof data !== 'object' || data === null) {
        // console.error("Load function requires valid target and data objects.");
        return;
    }

    // NEW: Handle if target itself is a Map and data is its serialized form (object)
    if (target instanceof Map && typeof data === 'object' && !Array.isArray(data)) {
        // console.group(`LOAD TARGET IS MAP: Populating Map instance <${target?.constructor?.name}> directly from object data. Target existing keys: [${Array.from(target.keys()).join(', ')}], Data keys: [${Object.keys(data).join(', ')}]`);
        const liveMapInstance = target as Map<any, any>; // target itself is the map

        for (const [savedMapKey, itemSavedContent] of Object.entries(data)) {
            if (liveMapInstance.has(savedMapKey)) {
                const liveMapValue = liveMapInstance.get(savedMapKey);
                // console.log(`  - Updating existing key "${savedMapKey}" in target Map.`);
                // Check if both live and saved values are objects suitable for recursive loading
                if (liveMapValue && typeof (liveMapValue as any).loadState === 'function' && typeof itemSavedContent === 'object' && itemSavedContent !== null) {
                    // console.log(`    - Calling loadState on existing value for key "${savedMapKey}". Type: ${liveMapValue?.constructor?.name}`);
                    (liveMapValue as any).loadState(itemSavedContent);
                } else if (liveMapValue && typeof liveMapValue === 'object' && typeof itemSavedContent === 'object' && itemSavedContent !== null && isSavableObject(liveMapValue)) {
                    // Only use recursive load for savable objects (class instances)
                    // console.log(`    - Recursively loading into existing object value for key "${savedMapKey}". Type: ${liveMapValue?.constructor?.name}`);
                    load(liveMapValue, itemSavedContent);
                } else {
                    // For plain objects, primitives, or type mismatch - replace directly
                    // console.log(`    - Replacing value for key "${savedMapKey}". Saved type: ${typeof itemSavedContent}`);
                    liveMapInstance.set(savedMapKey, itemSavedContent);
                }
            } else {
                // Key not in live map - set directly
                // console.log(`  - Setting new key "${savedMapKey}" in target Map. Saved type: ${typeof itemSavedContent}`);
                liveMapInstance.set(savedMapKey, itemSavedContent);
            }
        }
        // console.groupEnd();
        return; // Target Map is handled, return.
    }

    for (const key of Object.keys(data)) {
        // console.group(`LOAD Processing key: "${key}"`);

        // Check if the key exists on the target
        const keyExistsInTarget = key in target;

        // Get live property descriptor BEFORE accessing it, avoids triggering Vue reactivity unnecessarily sometimes
        const descriptor = Object.getOwnPropertyDescriptor(target, key)
            || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), key); // Check prototype too
        const liveProperty = keyExistsInTarget ? target[key] : undefined; // Only access if key exists
        const savedValue = data[key];

        // console.log(`  - Key exists in target: ${keyExistsInTarget}`);
        if (keyExistsInTarget) {
            // console.log(`  - Live property type: ${typeof liveProperty}, Is Ref: ${isRef(liveProperty)}, Is Array: ${Array.isArray(liveProperty)}, Is Map: ${liveProperty instanceof Map}, Is Set: ${liveProperty instanceof Set}`);
        }
        // // console.log(`  - Live descriptor:`, descriptor);
        // console.log(`  - Saved value type: ${typeof savedValue}, Is Array: ${Array.isArray(savedValue)}`);

        if (isSkipped(target, key)) {
            // console.log(`  - Key "${key}" is skipped via @Skip().`);
            // console.groupEnd();
            continue;
        }

        // Skip if saved value is undefined
        if (savedValue === undefined) {
            // console.log(`  - Saved value for key "${key}" is undefined. Skipping.`);
            // console.groupEnd();
            continue;
        }

        // Handle the case where key doesn't exist in target
        if (!keyExistsInTarget) {
            // Check if we should add this new key
            // For now, we'll add it if it's a valid property name and not a function
            if (typeof savedValue !== 'function') {
                // console.log(`  - Key "${key}" not found on target object. Adding it with saved value.`);
                try {
                    // Check if savedValue looks like a serialized Map (object but not array)
                    // Note: This is a heuristic - we can't be 100% sure without type information
                    if (typeof savedValue === 'object' && savedValue !== null && !Array.isArray(savedValue)) {
                        // Check if this might be a Map by looking at decorator metadata
                        const populationInfo = getCollectionPopulationInfo(target, key);
                        if (populationInfo && populationInfo.itemConstructor === Map) {
                            // console.log(`    - Detected @Populate(Map) decorator. Creating new Map instance.`);
                            const newMap = new Map();
                            for (const [mapKey, mapValue] of Object.entries(savedValue)) {
                                newMap.set(mapKey, mapValue);
                            }
                            target[key] = newMap;
                        } else {
                            // Could be a plain object or a serialized Map without decorator
                            // For safety, we'll treat it as a plain object unless we have more info
                            target[key] = savedValue;
                        }
                    }
                    // Check if savedValue looks like a serialized Set (array)
                    else if (Array.isArray(savedValue)) {
                        // Check if this might be a Set by looking at decorator metadata
                        const populationInfo = getCollectionPopulationInfo(target, key);
                        if (populationInfo && populationInfo.itemConstructor === Set) {
                            // console.log(`    - Detected @Populate(Set) decorator. Creating new Set instance.`);
                            target[key] = new Set(savedValue);
                        } else {
                            // Just an array
                            target[key] = savedValue;
                        }
                    }
                    else {
                        // Primitive or other type
                        target[key] = savedValue;
                    }
                } catch (e) {
                    // console.error(`  - Error adding new key "${key}" to target:`, e);
                }
            } else {
                // console.log(`  - Key "${key}" not found on target object and saved value is a function. Skipping.`);
            }
            // console.groupEnd();
            continue;
        }

        // ----- 1. ARRAY HANDLING (Covers direct arrays and Ref<Array>) -----
        // This logic correctly determines if the effective property is an array (direct or unwrapped from Ref)
        let isLiveArrayLike = Array.isArray(liveProperty);
        let liveArrayInstance = liveProperty; // This will be the actual array instance to modify

        if (!isLiveArrayLike && isRef(liveProperty) && Array.isArray(liveProperty.value)) {
            isLiveArrayLike = true;
            liveArrayInstance = liveProperty.value; // Target the unwrapped array for modification
        }

        if (isLiveArrayLike && Array.isArray(savedValue)) {
            const arrayHandlingPreamble = `  - Branch ARRAY: Processing array for key "${key}"`;

            const populationInfo = getCollectionPopulationInfo(target, key);

            if (populationInfo && populationInfo.mode === 'replace') {
                // console.log(`${arrayHandlingPreamble} with @Populate(mode='replace', constructor='${populationInfo.itemConstructor.name}'). Replacing entire collection.`);
                liveArrayInstance.length = 0; // Clear existing array
                for (const savedItemData of savedValue) {
                    if (savedItemData && typeof savedItemData === 'object') { // Expect objects for instantiation
                        const newItem = new (populationInfo.itemConstructor as any)();
                        if (typeof newItem.loadState === 'function') {
                            newItem.loadState(savedItemData);
                        } else {
                            load(newItem, savedItemData);
                            // console.warn(`    - Instantiated ${populationInfo.itemConstructor.name} for array item in "${key}" but no loadState method found. Used recursive load. Item data:`, savedItemData);
                        }
                        liveArrayInstance.push(newItem);
                    } else {
                        // console.warn(`    - Saved item data for populated array "${key}" (expected type ${populationInfo.itemConstructor.name}) is not an object or is null. Skipping. Data:`, savedItemData);
                    }
                }
                continue; // Array handled
            } else if (!populationInfo) {
                // Handles arrays of primitives (like string[]) or plain objects where no itemConstructor is specified.
                // console.log(`${arrayHandlingPreamble} by direct content replacement (no @Populate item info).`);
                liveArrayInstance.length = 0;
                for (const savedItem of savedValue) {
                    liveArrayInstance.push(savedItem);
                }
                continue; // Array handled
            } else if (populationInfo.mode === 'update') {
                // Update mode: Only update existing items by ID, don't add new or remove missing
                // console.log(`${arrayHandlingPreamble} using ID-based update (mode='update', constructor='${populationInfo.itemConstructor.name}'). Only updating existing items.`);

                const savedItemsMap = new Map<string | number, any>();
                for (const item of savedValue) {
                    if (item && typeof item === 'object' && (item as LoadableItem).id !== undefined && (item as LoadableItem).id !== null) {
                        savedItemsMap.set((item as LoadableItem).id, item);
                    } else {
                        // console.warn(`    - Saved array item for key "${key}" (ID-matching/update mode) is missing 'id' or not an object. Item:`, item);
                    }
                }

                // Update existing items only, keep all items in the array
                for (const liveItem of liveArrayInstance) {
                    const loadableLiveItem = liveItem as LoadableItem;

                    if (loadableLiveItem && typeof loadableLiveItem === 'object' && loadableLiveItem.id !== undefined && loadableLiveItem.id !== null) {
                        const savedItemData = savedItemsMap.get(loadableLiveItem.id);
                        if (savedItemData) { // Item exists in saved data, update it
                            // Ensure liveItem is of the correct constructor type
                            if (liveItem instanceof populationInfo.itemConstructor) {
                                // console.log(`    - Updating existing item id='${loadableLiveItem.id}'.`);
                                if (typeof loadableLiveItem.loadState === 'function') {
                                    loadableLiveItem.loadState(savedItemData);
                                } else {
                                    load(liveItem, savedItemData);
                                }
                            } else {
                                // console.warn(`    - Live item id='${loadableLiveItem.id}' type mismatch. Expected ${populationInfo.itemConstructor.name}. Skipping update.`);
                            }
                        } else {
                            // Live item not in saved data - for 'update' mode, keep it as is
                            // console.log(`    - Live item id='${loadableLiveItem.id}' not in saved data. Keeping existing item (update mode).`);
                        }
                    } else {
                        // console.warn(`    - Live array item for key "${key}" (ID-matching/update mode) is invalid (no id/not object). Keeping as is. Item:`, liveItem);
                    }
                }

                continue; // Array handled
            } else {
                // This case: mode='merge' or other modes
                // Merge mode: Update existing, add new, but keep items not in saved data
                // console.log(`${arrayHandlingPreamble} using ID-based merge (mode='${populationInfo.mode}', constructor='${populationInfo.itemConstructor.name}').`);

                const savedItemsMap = new Map<string | number, any>();
                for (const item of savedValue) {
                    if (item && typeof item === 'object' && (item as LoadableItem).id !== undefined && (item as LoadableItem).id !== null) {
                        savedItemsMap.set((item as LoadableItem).id, item);
                    } else {
                        // console.warn(`    - Saved array item for key "${key}" (ID-matching/merge mode) is missing 'id' or not an object. Item:`, item);
                    }
                }

                // Update existing items and keep all of them
                for (const liveItem of liveArrayInstance) {
                    const loadableLiveItem = liveItem as LoadableItem;

                    if (loadableLiveItem && typeof loadableLiveItem === 'object' && loadableLiveItem.id !== undefined && loadableLiveItem.id !== null) {
                        const savedItemData = savedItemsMap.get(loadableLiveItem.id);
                        if (savedItemData) { // Item exists in saved data, update it
                            // Ensure liveItem is of the correct constructor type
                            if (liveItem instanceof populationInfo.itemConstructor) {
                                // console.log(`    - Updating existing item id='${loadableLiveItem.id}'.`);
                                if (typeof loadableLiveItem.loadState === 'function') {
                                    loadableLiveItem.loadState(savedItemData);
                                } else {
                                    load(liveItem, savedItemData);
                                }
                                savedItemsMap.delete(loadableLiveItem.id); // Mark as processed
                            } else {
                                // console.warn(`    - Live item id='${loadableLiveItem.id}' type mismatch. Expected ${populationInfo.itemConstructor.name}. Skipping update.`);
                            }
                        } else {
                            // Live item not in saved data - for 'merge' mode, keep it as is
                            // console.log(`    - Live item id='${loadableLiveItem.id}' not in saved data. Keeping existing item (merge mode).`);
                        }
                    } else {
                        // console.warn(`    - Live array item for key "${key}" (ID-matching/merge mode) is invalid (no id/not object). Keeping as is. Item:`, liveItem);
                    }
                }

                // Add new items from saved data (those remaining in savedItemsMap)
                for (const [id, savedItemData] of savedItemsMap.entries()) {
                    // console.log(`    - Adding new item id='${id}' from saved data.`);
                    const newItemInstance = new (populationInfo.itemConstructor as any)();
                    const loadableNewItem = newItemInstance as LoadableItem;

                    // Ensure newItemInstance is an object and attempt to set ID
                    if (typeof loadableNewItem === 'object' && loadableNewItem !== null && 'id' in loadableNewItem) {
                        const descriptor = Object.getOwnPropertyDescriptor(loadableNewItem, 'id');
                        if (descriptor && (descriptor.writable || descriptor.set)) {
                            try { loadableNewItem.id = id; } catch (e) {
                                // console.warn(`    - Could not set id on new item id='${id}'. Error: ${e}`);
                            }
                        } else if (loadableNewItem.id === undefined) {
                            // console.warn(`    - id property on new item id='${id}' is not writable or has no setter, and is undefined. It might not be correctly set.`);
                        }
                    } else if (typeof loadableNewItem === 'object' && loadableNewItem !== null && !('id' in loadableNewItem)) {
                        // console.warn(`    - New item (constructor: ${populationInfo.itemConstructor.name}) for id='${id}' does not have an 'id' property. Saved id will not be set on instance.`);
                    }


                    if (typeof loadableNewItem === 'object' && loadableNewItem !== null && typeof loadableNewItem.loadState === 'function') {
                        loadableNewItem.loadState(savedItemData);
                    } else if (typeof loadableNewItem === 'object' && loadableNewItem !== null) {
                        load(newItemInstance, savedItemData);
                    } else {
                        // console.warn(`    - New item for id='${id}' is not an object after construction. Pushing saved data directly. This might be incorrect.`);
                        liveArrayInstance.push(savedItemData);
                        continue;
                    }
                    liveArrayInstance.push(newItemInstance);
                }

                continue; // Array handled
            }
        }
        // ----- END OF ARRAY HANDLING -----


        // ----- 2. REF HANDLING (for non-array Refs) -----
        if (isRef(liveProperty)) {
            // console.log(`  - Branch Ref (Non-Array): Handling for key "${key}".`);
            const actualLiveValue = liveProperty.value;

            // 2.A. Ref<Map>
            if (actualLiveValue instanceof Map && typeof savedValue === 'object' && savedValue !== null && !Array.isArray(savedValue)) {
                // console.log(`    - Ref holds a Map. Processing as Map from saved object.`);
                const liveMapInstance = actualLiveValue as Map<any, any>;

                const populationInfo = getCollectionPopulationInfo(target, key);

                if (populationInfo) {
                    const itemConstructor = populationInfo.itemConstructor;
                    const mode = populationInfo.mode;
                    // console.log(`  - Collection "${key}" (Ref<Map>) is marked for population with value type: ${itemConstructor.name}, mode: ${mode}.`);

                    if (mode === 'replace') {
                        liveMapInstance.clear();
                        for (const [savedMapKey, itemSavedData] of Object.entries(savedValue)) {
                            if (itemSavedData && typeof itemSavedData === 'object') {
                                const newItem = new (itemConstructor as any)();
                                if (typeof newItem.loadState === 'function') {
                                    newItem.loadState(itemSavedData);
                                } else {
                                    load(newItem, itemSavedData); // Recursive load
                                    // console.warn(`    - (replace) Instantiated ${itemConstructor.name} for map value (key: "${savedMapKey}") in "${key}" but no loadState. Used recursive load. Data:`, itemSavedData);
                                }
                                liveMapInstance.set(savedMapKey, newItem);
                            } else {
                                // console.warn(`    - (replace) Saved item data for populated map "${key}" (key: "${savedMapKey}", expected type ${itemConstructor.name}) is not an object or is null. Setting as is or skipping. Data:`, itemSavedData);
                                liveMapInstance.set(savedMapKey, itemSavedData); // Or skip, depending on desired behavior for non-objects
                            }
                        }
                    } else if (mode === 'update') {
                        // Update mode: Only update existing instances, don't add new ones
                        for (const [savedMapKey, itemSavedData] of Object.entries(savedValue)) {
                            // Only process if the key already exists in the live map
                            if (!liveMapInstance.has(savedMapKey)) {
                                // console.log(`    - (update) Skipping key "${savedMapKey}" as it doesn't exist in live map (update mode only updates existing).`);
                                continue;
                            }

                            if (!(itemSavedData && typeof itemSavedData === 'object')) {
                                // console.warn(`    - (update) Saved item data for map "${key}" (key: "${savedMapKey}") is not an object. Skipping update. Data:`, itemSavedData);
                                continue;
                            }

                            const existingItem = liveMapInstance.get(savedMapKey);
                            if (existingItem instanceof itemConstructor) {
                                // console.log(`    - (update) Updating existing instance of ${itemConstructor.name} for key "${savedMapKey}".`);
                                if (typeof (existingItem as any).loadState === 'function') {
                                    (existingItem as any).loadState(itemSavedData);
                                } else {
                                    load(existingItem, itemSavedData);
                                }
                            } else {
                                // console.warn(`    - (update) Existing item at key "${savedMapKey}" is not an instance of ${itemConstructor.name}. Skipping update.`);
                            }
                        }
                    } else if (mode === 'merge') {
                        // console.log(`    - (merge) Merging items for Ref<Map> key "${key}" with constructor ${itemConstructor.name}.`);
                        for (const [savedMapKey, itemSavedData] of Object.entries(savedValue)) {
                            if (!(itemSavedData && typeof itemSavedData === 'object')) {
                                // console.warn(`    - (merge) Saved item data for map "${key}" (key: "${savedMapKey}") is not an object. Setting primitive value directly. Data:`, itemSavedData);
                                liveMapInstance.set(savedMapKey, itemSavedData);
                                continue;
                            }

                            let instanceToLoad: any;
                            if (liveMapInstance.has(savedMapKey)) {
                                const existingItem = liveMapInstance.get(savedMapKey);
                                if (existingItem instanceof itemConstructor) {
                                    instanceToLoad = existingItem;
                                    // console.log(`    - (merge) Updating existing instance of ${itemConstructor.name} for key "${savedMapKey}".`);
                                } else {
                                    // console.log(`    - (merge) Replacing existing plain object/wrong type with new instance of ${itemConstructor.name} for key "${savedMapKey}".`);
                                    instanceToLoad = new (itemConstructor as any)();
                                    liveMapInstance.set(savedMapKey, instanceToLoad);
                                }
                            } else {
                                // console.log(`    - (merge) Adding new instance of ${itemConstructor.name} for key "${savedMapKey}".`);
                                instanceToLoad = new (itemConstructor as any)();
                                liveMapInstance.set(savedMapKey, instanceToLoad);
                            }

                            if (typeof instanceToLoad.loadState === 'function') {
                                instanceToLoad.loadState(itemSavedData);
                            } else {
                                load(instanceToLoad, itemSavedData);
                                // console.warn(`    - (merge) Instantiated/Found ${itemConstructor.name} for map value (key: "${savedMapKey}") in "${key}" but no loadState. Used recursive load. Data:`, itemSavedData);
                            }
                        }
                    }
                    // console.groupEnd();
                    continue;
                }

                // Fallback for non-populated Ref<Map>
                // console.log(`    - No @Populate decorator for Ref<Map>. Implementing default replace behavior.`);

                // First, remove keys that exist in live map but not in saved data
                for (const liveKey of Array.from(liveMapInstance.keys())) {
                    if (!Object.prototype.hasOwnProperty.call(savedValue, liveKey)) {
                        // console.log(`      - Removing key "${liveKey}" from live Ref<Map> as it is not in saved data.`);
                        liveMapInstance.delete(liveKey);
                    }
                }

                // Then, update existing and add new keys from saved data
                for (const savedMapKey in savedValue) {
                    if (Object.prototype.hasOwnProperty.call(savedValue, savedMapKey)) {
                        const itemSavedContent = savedValue[savedMapKey];
                        // Attempt to load into existing map entries or create new ones if necessary.
                        // For simplicity, this example updates existing or adds new.
                        // More complex logic might be needed based on whether map keys are fixed or dynamic.
                        if (liveMapInstance.has(savedMapKey)) {
                            const liveMapValue = liveMapInstance.get(savedMapKey);
                            // console.log(`      - Updating existing key "${savedMapKey}" in Ref<Map>.`);
                            if (liveMapValue && typeof liveMapValue.loadState === 'function') {
                                liveMapValue.loadState(itemSavedContent.state && typeof itemSavedContent.state === 'object' ? itemSavedContent.state : itemSavedContent);
                            } else if (liveMapValue && typeof liveMapValue === 'object' && typeof itemSavedContent === 'object' && itemSavedContent !== null && isSavableObject(liveMapValue)) {
                                // Only use recursive load for savable objects (class instances)
                                load(liveMapValue, itemSavedContent);
                            } else { // Primitive in map or non-object saved content, or plain objects
                                liveMapInstance.set(savedMapKey, itemSavedContent);
                            }
                        } else {
                            // console.log(`      - Adding new key "${savedMapKey}" from saved data to live Ref<Map>.`);
                            liveMapInstance.set(savedMapKey, itemSavedContent);
                        }
                    }
                }
            }
            // 2.B. Ref<Set>
            else if (actualLiveValue instanceof Set && Array.isArray(savedValue)) {
                // console.log(`    - Ref holds a Set. Reconstructing from saved array.`);
                const liveSetInstance = actualLiveValue as Set<any>;
                liveSetInstance.clear();
                for (const item of savedValue) {
                    // Assuming items in Set are primitives or savable as is from array.
                    // If Set contains complex objects needing reconstruction, 'loadAny(item)' or similar would be needed.
                    liveSetInstance.add(item);
                }
            }
            // 2.C. Ref<Object> (savable/reactive or plain, but not Map/Set/Array)
            else if (actualLiveValue && typeof actualLiveValue === 'object' && typeof savedValue === 'object' && savedValue !== null) {
                if (isSavableObject(actualLiveValue) || isReactive(actualLiveValue)) {
                    // console.log(`      - Ref holds savable/reactive object. Recursing into ref.value.`);
                    load(actualLiveValue, savedValue);
                } else {
                    // console.log(`      - Ref holds plain object. Assigning saved value directly to ref.value.`);
                    liveProperty.value = savedValue;
                }
            }
            // 2.D. Ref<Primitive> or other cases (e.g., savedValue is not an object suitable for recursion)
            else {
                // console.log(`    - Setting primitive, or incompatible saved value, into ref.`);
                liveProperty.value = savedValue;
            }
            // console.groupEnd();
            continue; // Ref handled, move to next key
        }
        // ----- END OF REF HANDLING -----


        // ----- 3. DIRECT MAP HANDLING (Not a Ref, Not an Array) -----
        if (liveProperty instanceof Map && typeof savedValue === 'object' && savedValue !== null && !Array.isArray(savedValue)) {
            // console.log(`  - Branch MAP (Direct): Handling for key "${key}".`);
            const liveMapInstance = liveProperty as Map<any, any>;

            const populationInfo = getCollectionPopulationInfo(target, key);

            if (populationInfo) {
                const itemConstructor = populationInfo.itemConstructor;
                const mode = populationInfo.mode;
                // console.log(`  - Collection "${key}" (Direct Map) is marked for population with value type: ${itemConstructor.name}, mode: ${mode}.`);

                if (mode === 'replace') {
                    liveMapInstance.clear();
                    for (const [savedMapKey, itemSavedData] of Object.entries(savedValue)) {
                        if (itemSavedData && typeof itemSavedData === 'object') {
                            const newItem = new (itemConstructor as any)();
                            if (typeof newItem.loadState === 'function') {
                                newItem.loadState(itemSavedData);
                            } else {
                                load(newItem, itemSavedData); // Recursive load
                                // console.warn(`    - (replace) Instantiated ${itemConstructor.name} for direct map value (key: "${savedMapKey}") in "${key}" but no loadState. Used recursive load. Data:`, itemSavedData);
                            }
                            liveMapInstance.set(savedMapKey, newItem);
                        } else {
                            // console.warn(`    - (replace) Saved item data for populated direct map "${key}" (key: "${savedMapKey}", expected type ${itemConstructor.name}) is not an object or is null. Setting as is or skipping. Data:`, itemSavedData);
                            liveMapInstance.set(savedMapKey, itemSavedData); // Or skip
                        }
                    }
                } else if (mode === 'update') {
                    // Update mode: Only update existing instances, don't add new ones
                    for (const [savedMapKey, itemSavedData] of Object.entries(savedValue)) {
                        // Only process if the key already exists in the live map
                        if (!liveMapInstance.has(savedMapKey)) {
                            // console.log(`    - (update) Skipping key "${savedMapKey}" as it doesn't exist in live map (update mode only updates existing).`);
                            continue;
                        }

                        if (!(itemSavedData && typeof itemSavedData === 'object')) {
                            // console.warn(`    - (update) Saved item data for direct map "${key}" (key: "${savedMapKey}") is not an object. Skipping update. Data:`, itemSavedData);
                            continue;
                        }

                        const existingItem = liveMapInstance.get(savedMapKey);
                        if (existingItem instanceof itemConstructor) {
                            // console.log(`    - (update) Updating existing instance of ${itemConstructor.name} for key "${savedMapKey}".`);
                            if (typeof (existingItem as any).loadState === 'function') {
                                (existingItem as any).loadState(itemSavedData);
                            } else {
                                load(existingItem, itemSavedData);
                            }
                        } else {
                            // console.warn(`    - (update) Existing item at key "${savedMapKey}" is not an instance of ${itemConstructor.name}. Skipping update.`);
                        }
                    }
                } else if (mode === 'merge') {
                    // console.log(`    - (merge) Merging items for direct Map key "${key}" with constructor ${itemConstructor.name}.`);
                    for (const [savedMapKey, itemSavedData] of Object.entries(savedValue)) {
                        if (!(itemSavedData && typeof itemSavedData === 'object')) {
                            // console.warn(`    - (merge) Saved item data for direct map "${key}" (key: "${savedMapKey}") is not an object. Setting primitive value directly. Data:`, itemSavedData);
                            liveMapInstance.set(savedMapKey, itemSavedData);
                            continue;
                        }

                        let instanceToLoad: any;
                        if (liveMapInstance.has(savedMapKey)) {
                            const existingItem = liveMapInstance.get(savedMapKey);
                            if (existingItem instanceof itemConstructor) {
                                instanceToLoad = existingItem;
                                // console.log(`    - (merge) Updating existing instance of ${itemConstructor.name} for key "${savedMapKey}".`);
                            } else {
                                // console.log(`    - (merge) Replacing existing plain object/wrong type with new instance of ${itemConstructor.name} for key "${savedMapKey}".`);
                                instanceToLoad = new (itemConstructor as any)();
                                liveMapInstance.set(savedMapKey, instanceToLoad);
                            }
                        } else {
                            // console.log(`    - (merge) Adding new instance of ${itemConstructor.name} for key "${savedMapKey}".`);
                            instanceToLoad = new (itemConstructor as any)();
                            liveMapInstance.set(savedMapKey, instanceToLoad);
                        }

                        if (typeof instanceToLoad.loadState === 'function') {
                            instanceToLoad.loadState(itemSavedData);
                        } else {
                            load(instanceToLoad, itemSavedData);
                            // console.warn(`    - (merge) Instantiated/Found ${itemConstructor.name} for direct map value (key: "${savedMapKey}") in "${key}" but no loadState. Used recursive load. Data:`, itemSavedData);
                        }
                    }
                }
                // console.groupEnd();
                continue;
            }

            // Fallback for non-populated direct Map (original logic)
            // console.log(`    - No @Populate decorator. Implementing default replace behavior for Map.`);

            // First, remove keys that exist in live map but not in saved data
            for (const liveKey of Array.from(liveMapInstance.keys())) {
                if (!Object.prototype.hasOwnProperty.call(savedValue, liveKey)) {
                    // console.log(`    - Removing key "${liveKey}" from live Map as it is not in saved data.`);
                    liveMapInstance.delete(liveKey);
                }
            }

            // Then, update existing and add new keys from saved data
            for (const savedMapKey in savedValue) {
                if (Object.prototype.hasOwnProperty.call(savedValue, savedMapKey)) {
                    const itemSavedContent = savedValue[savedMapKey];
                    if (liveMapInstance.has(savedMapKey)) {
                        const liveMapValue = liveMapInstance.get(savedMapKey);
                        // console.log(`    - Updating existing key "${savedMapKey}" in direct Map.`);
                        if (liveMapValue && typeof liveMapValue.loadState === 'function') {
                            liveMapValue.loadState(itemSavedContent.state && typeof itemSavedContent.state === 'object' ? itemSavedContent.state : itemSavedContent);
                        } else if (liveMapValue && typeof liveMapValue === 'object' && typeof itemSavedContent === 'object' && itemSavedContent !== null && isSavableObject(liveMapValue)) {
                            // Only use recursive load for savable objects (class instances)
                            load(liveMapValue, itemSavedContent);
                        } else {
                            // For plain objects or primitives - replace directly
                            liveMapInstance.set(savedMapKey, itemSavedContent);
                        }
                    } else {
                        // console.log(`    - Adding new key "${savedMapKey}" from saved data to live direct Map.`);
                        liveMapInstance.set(savedMapKey, itemSavedContent);
                    }
                }
            }
            // console.groupEnd();
            continue; // Direct Map handled
        }
        // ----- END OF DIRECT MAP HANDLING -----

        // ----- 4. DIRECT SET HANDLING (Not a Ref, Not an Array, Not a Map) -----
        if (liveProperty instanceof Set && Array.isArray(savedValue)) {
            // console.log(`  - Branch SET (Direct): Reconstructing Set for key "${key}" from saved array.`);
            const liveSetInstance = liveProperty as Set<any>;
            liveSetInstance.clear();
            for (const item of savedValue) {
                liveSetInstance.add(item); // Assuming items are primitives or already loaded correctly
            }
            // console.groupEnd();
            continue; // Direct Set handled
        }
        // ----- END OF DIRECT SET HANDLING -----


        // ----- 5. SAVABLE/REACTIVE OBJECT (Not Ref, Array, Map, or Set) -----
        if ((isSavableObject(liveProperty) || isReactive(liveProperty)) &&
            typeof savedValue === 'object' && savedValue !== null) {
            // This check ensures we don't try to process Maps/Sets/Arrays as generic objects if they somehow slipped through.
            // However, the `instanceof` checks above should catch them.
            // console.log(`  - Branch OBJECT (Direct Savable/Reactive, non-collection): Handling for key "${key}".`);
            if (typeof liveProperty.loadState === 'function') {
                // console.log(`    - Calling loadState on object.`);
                try {
                    liveProperty.loadState(savedValue);
                } catch (e) {
                    // console.error(`    - Error calling loadState for key "${key}":`, e);
                }
            } else {
                // console.log(`    - No loadState method found. Performing recursive load.`);
                load(liveProperty, savedValue);
            }
            // console.groupEnd();
            continue; // Object handled
        }
        // ----- END OF SAVABLE/REACTIVE OBJECT -----


        // ----- 6. PLAIN OBJECT HANDLING (Record types, plain objects) -----
        // Handle plain objects that aren't caught by the above cases
        if (liveProperty && typeof liveProperty === 'object' &&
            typeof savedValue === 'object' && savedValue !== null &&
            !Array.isArray(liveProperty) && !Array.isArray(savedValue) &&
            !(liveProperty instanceof Map) && !(liveProperty instanceof Set) &&
            !isRef(liveProperty) && !isSavableObject(liveProperty) && !isReactive(liveProperty)) {

            // console.log(`  - Branch PLAIN OBJECT: Handling plain object/Record for key "${key}".`);

            // Check if this Record has @Populate decorator for value types
            const populationInfo = getCollectionPopulationInfo(target, key);

            if (populationInfo) {
                const itemConstructor = populationInfo.itemConstructor;
                // console.log(`    - Record "${key}" is marked for population with value type: ${itemConstructor.name}.`);

                // Clear existing keys not in saved data
                for (const existingKey of Object.keys(liveProperty)) {
                    if (!(existingKey in savedValue)) {
                        delete liveProperty[existingKey];
                    }
                }

                // Process each saved key and reconstruct class instances
                for (const [savedKey, itemSavedData] of Object.entries(savedValue)) {
                    if (itemSavedData && typeof itemSavedData === 'object') {
                        // Check if existing value is already the correct instance
                        if (liveProperty[savedKey] instanceof itemConstructor) {
                            // Update existing instance
                            const existingInstance = liveProperty[savedKey];
                            if (typeof (existingInstance as any).loadState === 'function') {
                                (existingInstance as any).loadState(itemSavedData);
                            } else {
                                load(existingInstance, itemSavedData);
                            }
                        } else {
                            // Create new instance
                            const newItem = new (itemConstructor as any)();
                            // Use Object.assign for simple reconstruction without init()
                            Object.assign(newItem, itemSavedData);
                            liveProperty[savedKey] = newItem;
                        }
                    } else {
                        // Primitive value, set directly
                        liveProperty[savedKey] = itemSavedData;
                    }
                }
            } else {
                // No @Populate decorator - use default behavior (plain object copy)
                // console.log(`    - No @Populate decorator found. Using plain object copy.`);

                // Clear existing keys and copy all from saved
                for (const existingKey of Object.keys(liveProperty)) {
                    if (!(existingKey in savedValue)) {
                        delete liveProperty[existingKey];
                    }
                }

                // Copy all keys from saved data
                for (const savedKey of Object.keys(savedValue)) {
                    liveProperty[savedKey] = savedValue[savedKey];
                }
            }

            // console.groupEnd();
            continue; // Plain object handled
        }
        // ----- END OF PLAIN OBJECT HANDLING -----


        // ----- 7. DIRECT ASSIGNMENT (Primitives, Plain Objects not caught above) -----
        // Check if it's a simple property without a custom setter, and not a function.
        if (descriptor && !descriptor.set && typeof liveProperty !== 'function') {
            // console.log(`  - Branch ASSIGN: Direct assignment for key "${key}".`);
            try {
                target[key] = savedValue;
            } catch (e) {
                // console.error(`  - Error during direct assignment for key "${key}":`, e);
            }
        }
        // Else: Skip if it's a function, has only a setter, or some other unhandled case.
        else {
            // console.log(`  - Branch SKIP: Skipping key "${key}" (likely function, setter-only, or unhandled type).`);
        }
        // console.groupEnd();
    }
}
