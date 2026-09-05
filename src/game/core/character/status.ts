import { CharacterStatusObject } from '../../../schemas/characterStatusSchema';
import { Game } from '../../game';
import { BaseStatusObject } from '../../../schemas/characterStatusSchema';

// art_dx/dy/scale are optional so the partial-override merge in
// Character.reevaluate() can distinguish "not set on this status" (inherit
// from prior layer) from "explicitly 0" (reset).
export type SpineViewConfig = {
    atlas: string;
    skeleton: string;
    artDx?: number;
    artDy?: number;
    artScale?: number;
};

// Same optionality contract as SpineViewConfig: unset = inherit from prior status layer.
export type StaticArtViewConfig = {
    artDx?: number;
    artDy?: number;
    artScale?: number;
};

export type StatusInstance = {
    stacks: number;
    duration: number;   // -1 = permanent
    source?: string;    // optional caster id / origin per apply
};

export class Status {
    public id: string = "";
    public maxStacks: number = 1; // 0, -1, or undefined => unlimited
    public multiStack: boolean = false;
    public durationIncrement: boolean = false; // single-stack: reapply adds duration instead of refreshing
    public image: string = "";
    // Where this status BORROWS its look from when it defines no image of its own: the id of the
    // item that applied it, or of the ability that cast it. An id rather than a path, so a save
    // never freezes art: re-icon the source and every existing save follows, and a deleted source
    // degrades to no icon instead of a broken one. `image` stays authoritative and stays saved,
    // because a dev's hand-rolled createStatus({ image }) has nowhere else to keep it.
    public iconSource: string = "";
    public name: string = "";
    public description: string = "";
    public polarity: string = "";
    public rarity: string = "";
    // Mutual-exclusion group: applying a status supersedes any other status sharing this id.
    public groupId: string = "";

    public isHidden: boolean = false;

    public tags: string[] = [];
    public meta: Record<string, any> = {};

    public stats: Record<string, number> = {};
    public traits: Record<string, any> = {};
    public attributes: Record<string, string> = {};
    public skinLayers: Set<string> = new Set();
    public abilities: Set<string> = new Set();
    public abilityModifiers: any[] = [];

    // Spine configs keyed by view ('' = default, 'back' = back view, etc.)
    public spineViews: Map<string, SpineViewConfig> = new Map();

    // Static (non-spine) art placement keyed by view, same key scheme as spineViews.
    public staticArtViews: Map<string, StaticArtViewConfig> = new Map();

    // Per-instance storage. Single-stack statuses always have length 1.
    // Multi-stack statuses append a new instance per apply (DD-style).
    public _instances: StatusInstance[] = [{ stacks: 1, duration: -1 }];

    public computedStatsKeys: string[] = [];

    constructor(initialStats: Record<string, number> = {}) {
        this.stats = { ...initialStats };
    }

    /**
     * The icon to draw: an explicit image wins, otherwise the source's art is looked up live.
     * A prototype getter, so the save system (which walks own keys) never serializes it.
     */
    public get displayImage(): string {
        if (this.image) return this.image;
        if (!this.iconSource) return "";
        const game = Game.getInstance();
        const item = game.itemSystem.itemTemplatesMap.get(this.iconSource) as any;
        if (item?.traits?.image) return item.traits.image as string;
        const ability = game.characterSystem.abilityTemplatesMap.get(this.iconSource);
        return ((ability?.meta as any)?.icon as string) || "";
    }

    // ===== currentStacks / duration are proxied through _instances. =====
    // For single-stack: sum across instances == _instances[0].stacks.
    // For multi-stack: getter sums; setter throws (use applyInstance / removeStacks).

    public get currentStacks(): number {
        if (this._instances.length === 0) return 0;
        if (this.multiStack) {
            let sum = 0;
            for (const i of this._instances) sum += i.stacks;
            return sum;
        }
        return this._instances[0].stacks;
    }

    public set currentStacks(value: number) {
        if (this.multiStack) {
            throw new Error(`Cannot set currentStacks on multi-stack status "${this.id}" — use applyInstance() / addStacks() / removeStacks()`);
        }
        if (this._instances.length === 0) this._instances.push({ stacks: value, duration: -1 });
        else this._instances[0].stacks = value;
    }

    public get duration(): number {
        if (this._instances.length === 0) return 0;
        if (this.multiStack) {
            let max = this._instances[0].duration;
            for (let i = 1; i < this._instances.length; i++) {
                if (this._instances[i].duration > max) max = this._instances[i].duration;
            }
            return max;
        }
        return this._instances[0].duration;
    }

    public set duration(value: number) {
        if (this.multiStack) {
            throw new Error(`Cannot set duration directly on multi-stack status "${this.id}" — use applyInstance()`);
        }
        if (this._instances.length === 0) this._instances.push({ stacks: 1, duration: value });
        else this._instances[0].duration = value;
    }


    public setValues(obj: CharacterStatusObject | BaseStatusObject) {
        this.traits = obj.traits || {};
        this.attributes = obj.attributes || {};
        this.skinLayers = new Set(obj.skin_layers || []);
        this.abilities = new Set(obj.abilities || []);
        this.stats = obj.stats || {};

        // Spine configs: array of { id, view?, atlas, skeleton, art_dx?, art_dy?, art_scale? }
        // art_* are conditionally included so the merge can fall back to prior
        // layers when this status doesn't set them (e.g. costume swaps that
        // re-use the same skeleton should inherit the core's calibrated offsets).
        if (obj.spine && Array.isArray(obj.spine)) {
            for (const entry of obj.spine as any[]) {
                if (entry.atlas && entry.skeleton) {
                    const rawView = entry.view || '';
                    const key = rawView === '_default' ? '' : rawView;
                    const view: SpineViewConfig = {
                        atlas: entry.atlas,
                        skeleton: entry.skeleton,
                    };
                    if (typeof entry.art_dx === 'number') view.artDx = entry.art_dx;
                    if (typeof entry.art_dy === 'number') view.artDy = entry.art_dy;
                    if (typeof entry.art_scale === 'number') view.artScale = entry.art_scale;
                    this.spineViews.set(key, view);
                }
            }
        }

        // Static art placement: array of { view?, art_dx?, art_dy?, art_scale? }.
        // Fields are conditionally included so the merge can fall back to prior layers.
        if ((obj as any).static_art && Array.isArray((obj as any).static_art)) {
            for (const entry of (obj as any).static_art as any[]) {
                const rawView = entry.view || '';
                const key = rawView === '_default' ? '' : rawView;
                const view: StaticArtViewConfig = {};
                if (typeof entry.art_dx === 'number') view.artDx = entry.art_dx;
                if (typeof entry.art_dy === 'number') view.artDy = entry.art_dy;
                if (typeof entry.art_scale === 'number') view.artScale = entry.art_scale;
                this.staticArtViews.set(key, view);
            }
        }

        // Resolve ability_modifiers: string IDs (from editor) → deep-cloned template objects
        const rawMods: any[] = obj.ability_modifiers || [];
        const resolved: any[] = [];
        for (const mod of rawMods) {
            if (typeof mod === 'string') {
                const template = Game.getInstance().characterSystem.abilityTemplatesMap.get(mod);
                if (!template?.modifies) continue;
                const clone = JSON.parse(JSON.stringify(template));
                clone.ability_id = clone.modifies;
                resolved.push(clone);
            } else {
                resolved.push(mod);
            }
        }
        this.abilityModifiers = resolved;

        // If CharacterStatusObject is passed, also set status values
        if ('max_stacks' in obj && obj.max_stacks !== undefined) {
            this.maxStacks = obj.max_stacks;
            this.image = obj.image || "";
        }
        if ('multi_stack' in obj && obj.multi_stack) this.multiStack = true;
        if ('duration_increment' in obj && obj.duration_increment) this.durationIncrement = true;
        if ('meta' in obj && obj.meta) this.meta = obj.meta as Record<string, any>;

        if ('name' in obj && obj.name) this.name = obj.name;
        if ('description' in obj && obj.description) this.description = obj.description;
        if ('image' in obj && obj.image) this.image = obj.image;
        if ('icon_source' in obj && (obj as any).icon_source) this.iconSource = (obj as any).icon_source;
        if ('rarity' in obj && typeof obj.rarity === 'string') this.rarity = obj.rarity;
        if ('polarity' in obj && obj.polarity) this.polarity = obj.polarity;
        if ('group_id' in obj && (obj as any).group_id) this.groupId = (obj as any).group_id;
        if ('tags' in obj && obj.tags) this.tags = obj.tags as string[];
        if ('duration' in obj && typeof obj.duration === 'number') {
            this._instances = [{ stacks: this._instances[0]?.stacks ?? 1, duration: obj.duration }];
        }
        if ('is_hidden' in obj && obj.is_hidden) this.isHidden = true;

        // set computed stats
        if (obj.computed_stats) {
            for (let stat of obj.computed_stats) {
                this.setComputedStats(stat);
            }
        }

    }

    public isStackable(): boolean {
        const m = this.maxStacks;
        return m === undefined || m <= 0 || m > 1;
    }

    public isUnlimited(): boolean {
        const m = this.maxStacks;
        return m === undefined || m <= 0;
    }

    public addStacks(amount: number = 1): boolean {
        if (!this.isStackable()) return false;
        if (this._instances.length === 0) this._instances.push({ stacks: 0, duration: -1 });

        if (this.multiStack) {
            // Legacy callers that addStacks on a multi-stack status bump the first instance.
            // New callers should use applyInstance() to append a fresh per-instance entry.
            const inst = this._instances[0];
            if (this.isUnlimited()) {
                inst.stacks += amount;
                return true;
            }
            const total = this.currentStacks;
            const allowed = Math.min(amount, this.maxStacks - total);
            if (allowed <= 0) return false;
            inst.stacks += allowed;
            return allowed === amount;
        }

        const inst = this._instances[0];
        const newStacks = inst.stacks + amount;
        if (this.isUnlimited()) {
            inst.stacks = newStacks;
            return true;
        }
        if (newStacks > this.maxStacks) {
            inst.stacks = this.maxStacks;
            return false;
        }
        inst.stacks = newStacks;
        return true;
    }

    /**
     * Apply: for multi_stack=true appends a new instance (DD-style). For
     * multi_stack=false refreshes the single instance — duration goes to
     * max(existing, new), stacks add and clamp to max_stacks.
     * Returns the number of stacks that were actually applied (clamped).
     */
    public applyInstance(opts: { stacks?: number; duration?: number; source?: string } = {}): { applied: number } {
        const stacks = opts.stacks ?? 1;
        const duration = opts.duration ?? (this._instances[0]?.duration ?? -1);
        const source = opts.source;

        if (this.multiStack) {
            if (this.isUnlimited()) {
                this._instances.push({ stacks, duration, source });
                return { applied: stacks };
            }
            const total = this.currentStacks;
            const allowed = Math.min(stacks, this.maxStacks - total);
            if (allowed <= 0) return { applied: 0 };
            this._instances.push({ stacks: allowed, duration, source });
            return { applied: allowed };
        }

        // Single-stack: refresh
        if (this._instances.length === 0) {
            this._instances.push({ stacks, duration, source });
            return { applied: stacks };
        }
        const existing = this._instances[0];
        const max = this.isUnlimited() ? Infinity : this.maxStacks;
        const before = existing.stacks;
        existing.stacks = Math.min(max, before + stacks);
        // Re-apply duration: accumulate when durationIncrement, else refresh to the longer
        // of the two (both -1 = permanent stays permanent).
        if (duration > 0) {
            if (this.durationIncrement && existing.duration > 0) existing.duration += duration;
            else if (existing.duration <= 0 || duration > existing.duration) existing.duration = duration;
        }
        if (source) existing.source = source;
        return { applied: existing.stacks - before };
    }

    /**
     * Tick all instances' durations by `amount`. Drops expired instances
     * (those whose duration falls to 0 or below, excluding permanent -1).
     * Returns the array of expired instances (for emitter triggering).
     */
    public tickDuration(amount: number = 1): StatusInstance[] {
        const expired: StatusInstance[] = [];
        const kept: StatusInstance[] = [];
        for (const inst of this._instances) {
            if (inst.duration < 0) {
                // permanent
                kept.push(inst);
                continue;
            }
            if (inst.duration === 0) {
                kept.push(inst);
                continue;
            }
            inst.duration -= amount;
            if (inst.duration <= 0) expired.push(inst);
            else kept.push(inst);
        }
        this._instances = kept;
        return expired;
    }

    /**
     * Remove `amount` stacks across instances, starting from the oldest.
     * Returns the number actually removed. Empties / removes instances that
     * drop to 0 stacks. Does NOT remove the status from the character.
     */
    public removeStacks(amount: number): number {
        let remaining = amount;
        let removed = 0;
        // Cleanse semantics: strip the stacks with the LONGEST remaining duration first
        // (permanent -1 counts as longest), so removing N stacks always prevents the most
        // future ticking. Shields deliberately do the opposite through their own drain in
        // the battle plugin — this path serves cleanses and stack decay.
        const lifespan = (d: number) => d === -1 ? Number.MAX_SAFE_INTEGER : d;
        const byLongest = [...this._instances].sort((a, b) => lifespan(b.duration) - lifespan(a.duration));
        for (const inst of byLongest) {
            if (remaining <= 0) break;
            const take = Math.min(inst.stacks, remaining);
            inst.stacks -= take;
            removed += take;
            remaining -= take;
        }
        this._instances = this._instances.filter(inst => inst.stacks > 0);
        return removed;
    }

    public getInstances(): readonly StatusInstance[] {
        return this._instances;
    }

    public addStat(name: string, value: number) {

        if (!Game.getInstance().characterSystem.statsMap.has(name)) {
            throw new Error(`Stat "${name}" does not exist.`);
        }
        this.stats[name] = (this.stats[name] || 0) + value;
    }

    public setComputedStats(key: string): void {

        if (!Game.getInstance().characterSystem.getStatComputer(key)) {
            throw new Error(`Stat computer with key "${key}" is not registered.`);
        }
        if (!this.computedStatsKeys.includes(key)) this.computedStatsKeys.push(key);
    }
}
