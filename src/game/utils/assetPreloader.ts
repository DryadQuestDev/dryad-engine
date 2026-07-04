import { Game } from '../game';
import { Character } from '../core/character/character';
import { spineRenderer } from './spineRenderer';

export interface PreloadCharacterAssetsOptions {
    /**
     * Extra attribute values to warm in addition to the character's current ones,
     * e.g. { battle_state: ['idle', 'attack', 'hit', ...] }. For each skin layer,
     * candidate image keys are generated as the product of these value sets —
     * keys are never parsed (attribute values may contain underscores).
     */
    simulateAttributes?: Record<string, string[]>;
    /** Also warm spine atlas/skeleton assets for every view. */
    spine?: boolean;
}

// Runaway guard for pathological attribute products on a single layer.
const MAX_KEYS_PER_LAYER = 64;

const warmedUrls = new Set<string>();

function warmImage(url: string): Promise<void> {
    if (!url || warmedUrls.has(url)) return Promise.resolve();
    warmedUrls.add(url);
    const img = Game.getInstance().coreSystem.persistImage(url);
    if (!img) return Promise.resolve();
    // decode() waits for fetch + decode; failures (missing file) resolve silently
    return img.decode().catch(() => { });
}

function candidateKeys(
    layer: { id: string; attributes?: string[] },
    baseAttributes: Record<string, string>,
    simulate?: Record<string, string[]>,
): string[] {
    let keys = [layer.id];
    if (!layer.attributes?.length) return keys;

    for (const attr of layer.attributes) {
        const values = new Set<string>();
        // Current value first — matches buildLayerLookupKey (undefined stays literal)
        values.add(String(baseAttributes[attr]));
        for (const v of simulate?.[attr] || []) values.add(String(v));

        const next: string[] = [];
        for (const key of keys) {
            for (const value of values) next.push(key + '_' + value);
        }
        keys = next;
        if (keys.length > MAX_KEYS_PER_LAYER) return keys.slice(0, MAX_KEYS_PER_LAYER);
    }
    return keys;
}

/**
 * Warms the browser cache with every image a character may render, so
 * attribute swaps (battle poses etc.) never fetch mid-animation.
 * Accepts a live Character, a live character id, or a character TEMPLATE id
 * (for not-yet-spawned characters like ability summons).
 * Missing/failed files resolve silently — the returned promise never rejects.
 */
export async function preloadCharacterAssets(
    target: Character | string,
    options: PreloadCharacterAssetsOptions = {},
): Promise<void> {
    const game = Game.getInstance();
    const characterSystem = game.characterSystem;

    let resolved: Character | string | null = target;
    if (typeof resolved === 'string') {
        const live = characterSystem.characters.value.get(resolved);
        if (live) resolved = live;
    }

    let baseAttributes: Record<string, string>;
    let layerIds: string[];
    let spineConfigs: { atlas?: string; skeleton?: string }[];
    let faceStatic: string | undefined;

    if (typeof resolved === 'string') {
        const template = characterSystem.templatesMap.get(resolved) as any;
        if (!template) return;
        baseAttributes = { ...(template.attributes || {}) };
        layerIds = [...(template.skin_layers || [])];
        spineConfigs = (template.spine || []).map((s: any) => ({ atlas: s.atlas, skeleton: s.skeleton }));
        faceStatic = template.traits?.face_static;
    } else if (resolved) {
        baseAttributes = { ...resolved.attributes };
        layerIds = [...resolved.skinLayers];
        spineConfigs = [...resolved.spineViews.values()].map(v => ({ atlas: v.atlas, skeleton: v.skeleton }));
        faceStatic = resolved.traits?.face_static;
    } else {
        return;
    }

    const tasks: Promise<unknown>[] = [];

    for (const layerId of layerIds) {
        const layer = characterSystem.skinLayersMap.get(layerId) as any;
        if (!layer || layer.type === 'spine') continue;
        const images = layer.images as Record<string, string> | undefined;
        const masks = layer.masks as Record<string, string> | undefined;
        if (!images && !masks) continue;

        for (const key of candidateKeys(layer, baseAttributes, options.simulateAttributes)) {
            if (images?.[key]) tasks.push(warmImage(images[key]));
            if (masks?.[key]) tasks.push(warmImage(masks[key]));
        }
    }

    if (faceStatic) tasks.push(warmImage(faceStatic));

    if (options.spine) {
        for (const config of spineConfigs) {
            if (config.atlas && config.skeleton) {
                tasks.push(spineRenderer.preloadAssets(config.atlas, config.skeleton).catch(() => { }));
            }
        }
    }

    await Promise.allSettled(tasks);
}
