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

function warmImage(url: string): Promise<void> {
    if (!url) return Promise.resolve();
    const core = Game.getInstance().coreSystem;
    // The image cache is the only record of what is warm, deliberately. A local "already
    // warmed" set never learns about eviction, so it keeps reporting success for images the
    // cache dropped hours ago — and the pose swap this exists to smooth starts fetching again
    // with nothing to explain why. A failed fetch stays cached as a broken element, so a
    // missing file is still only requested once per residency.
    const resident = core.hasImage(url);
    // Always persist: on a hit this counts as a use and keeps the entry off the eviction end.
    const img = core.persistImage(url);
    if (!img || resident) return Promise.resolve();
    // decode() waits for fetch + decode; failures (missing file) resolve silently
    return img.decode().catch(() => { });
}

/**
 * Fetch and decode a list of images, skipping empties and anything already warmed.
 * Never rejects — a missing file just resolves.
 */
export async function warmImages(urls: (string | undefined | null)[]): Promise<void> {
    await Promise.all(urls.map((url) => warmImage(url ?? '')));
}

function candidateKeys(
    layer: { id: string; attributes?: string[] },
    baseAttributes: Record<string, string>,
    simulate?: Record<string, string[]>,
): string[] {
    if (!layer.attributes?.length) return [layer.id];

    const valueSets = layer.attributes.map((attr) => {
        const values = new Set<string>();
        // Current value first — matches buildLayerLookupKey (undefined stays literal)
        values.add(String(baseAttributes[attr]));
        for (const v of simulate?.[attr] || []) values.add(String(v));
        return [...values];
    });

    // Enumerate combinations by index instead of growing the product, so the runaway guard can
    // stop at a count of WHOLE keys. Capping a half-expanded product (what this used to do) cut
    // keys short of their remaining attribute segments, and a partial key matches nothing in
    // layer.images — a tripped guard warmed zero images rather than the 64 it meant to.
    // Last attribute varies fastest, so combination 0 is the character's current look.
    const total = valueSets.reduce((n, values) => n * values.length, 1);
    const wanted = Math.min(total, MAX_KEYS_PER_LAYER);
    const keys: string[] = [];
    for (let i = 0; i < wanted; i++) {
        const parts: string[] = new Array(valueSets.length);
        let rest = i;
        for (let a = valueSets.length - 1; a >= 0; a--) {
            const values = valueSets[a];
            parts[a] = values[rest % values.length];
            rest = Math.floor(rest / values.length);
        }
        keys.push(layer.id + parts.map((part) => '_' + part).join(''));
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
