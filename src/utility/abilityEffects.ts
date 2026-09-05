/**
 * Ability effects are authored as an ARRAY of `{ id, name, description_attach, aspects }` but every
 * consumer (merging, description building, card rendering) wants a RECORD keyed by effect id, with
 * the authored metadata folded in alongside the aspects under `__`-prefixed keys — the description
 * builder skips those, so they ride along without ever rendering as a line.
 *
 * This lives in one place on purpose: it used to be copy-pasted in four (logicSystem,
 * characterSystem, AbilityCard, StatusObjectDisplay), and adding a field to only three of them
 * failed silently in whichever single view was missed.
 */

/** Authored effect fields carried onto the normalized aspects as `__<field>`. Add new ones here. */
const EFFECT_META_FIELDS = ['name', 'description_attach'] as const;

/** Same, but copied when merely *defined* — numeric fields where 0 is a real value, not "unset". */
const EFFECT_META_NUMERIC_FIELDS = ['order'] as const;

/**
 * Normalize an ability's effects into `{ [effectId]: aspects & __meta }`.
 * Already-normalized records are returned untouched, so callers can pass either shape.
 *
 * Effects authored without an `id` are keyed `'undefined'` rather than dropped — a few real
 * abilities rely on it (e.g. dryad_ane's `punch`/`heal`), and dropping them silently emptied
 * their card.
 */
export function normalizeAbilityEffects(effects: any): Record<string, Record<string, any>> {
    if (!effects) return {};
    if (!Array.isArray(effects)) return effects as Record<string, Record<string, any>>;

    const result: Record<string, Record<string, any>> = {};
    for (const effect of effects) {
        if (!effect) continue;
        const normalized: Record<string, any> = { ...(effect.aspects || {}) };
        for (const field of EFFECT_META_FIELDS) {
            if (effect[field]) normalized[`__${field}`] = effect[field];
        }
        for (const field of EFFECT_META_NUMERIC_FIELDS) {
            if (effect[field] !== undefined) normalized[`__${field}`] = effect[field];
        }
        result[effect.id ?? 'undefined'] = normalized;
    }
    return result;
}

/**
 * Deterministic effect order: `order` ascending, then id alphabetically.
 *
 * The id tiebreak matters — falling back to object insertion order would reproduce the exact
 * nondeterminism this exists to remove, since insertion follows the character's status Map (i.e. the
 * order skills happened to be learned or statuses applied). Effects that must hold a specific
 * sequence should say so with `order`.
 */
export function sortEffectIds(effects: Record<string, Record<string, any>>): string[] {
    return Object.keys(effects).sort((a, b) => {
        const orderA = effects[a]?.__order ?? 0;
        const orderB = effects[b]?.__order ?? 0;
        return orderA - orderB || a.localeCompare(b);
    });
}

/** Rebuild an effects record with its keys in {@link sortEffectIds} order. */
export function orderEffects(effects: Record<string, Record<string, any>>): Record<string, Record<string, any>> {
    const ordered: Record<string, Record<string, any>> = {};
    for (const id of sortEffectIds(effects)) ordered[id] = effects[id];
    return ordered;
}
