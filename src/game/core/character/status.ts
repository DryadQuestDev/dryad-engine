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

export class Status {
    public id: string = "";
    public maxStacks: number = 1; // -1 for unlimited
    public currentStacks: number = 1;
    public image: string = "";
    public name: string = "";
    public description: string = "";
    public polarity: string = "";
    public rarity: string = "";

    public isHidden: boolean = false;

    public tags: string[] = [];
    public duration: number = -1;

    public stats: Record<string, number> = {};
    public traits: Record<string, any> = {};
    public attributes: Record<string, string> = {};
    public skinLayers: Set<string> = new Set();
    public abilities: Set<string> = new Set();
    public abilityModifiers: any[] = [];

    // Spine configs keyed by view ('' = default, 'back' = back view, etc.)
    // _default and empty view normalize to '' at this layer.
    public spineViews: Map<string, SpineViewConfig> = new Map();


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

        if ('name' in obj && obj.name) this.name = obj.name;
        if ('description' in obj && obj.description) this.description = obj.description;
        if ('image' in obj && obj.image) this.image = obj.image;
        if ('rarity' in obj && typeof obj.rarity === 'string') this.rarity = obj.rarity;
        if ('polarity' in obj && obj.polarity) this.polarity = obj.polarity;
        if ('tags' in obj && obj.tags) this.tags = obj.tags as string[];
        if ('duration' in obj && typeof obj.duration === 'number') this.duration = obj.duration;
        if ('is_hidden' in obj && obj.is_hidden) this.isHidden = true;

        // set computed stats
        if (obj.computed_stats) {
            for (let stat of obj.computed_stats) {
                this.setComputedStats(stat);
            }
        }

    }

    public addStacks(amount: number = 1): boolean {
        if (!this.isStackable()) {
            return false;
        }

        const newStacks = this.currentStacks + amount;

        // -1 means unlimited stacks
        if (this.maxStacks === -1) {
            this.currentStacks = newStacks;
            return true;
        }

        // Check if we would exceed max stacks
        if (newStacks > this.maxStacks) {
            this.currentStacks = this.maxStacks;
            return false; // Couldn't add all stacks
        }

        this.currentStacks = newStacks;
        return true;
    }



    public computedStatsKey?: string;

    constructor(initialStats: Record<string, number> = {}) {
        this.stats = { ...initialStats };
    }

    public addStat(name: string, value: number) {

        if (!Game.getInstance().characterSystem.statsMap.has(name)) {
            throw new Error(`Stat "${name}" does not exist in characterStatsMap.`);
        }
        this.stats[name] = (this.stats[name] || 0) + value;
    }

    public setComputedStats(key: string): void {

        if (!Game.getInstance().characterSystem.getStatComputer(key)) {
            throw new Error(`Stat computer with key "${key}" is not registered.`);
        }
        this.computedStatsKey = key;
    }

    public isStackable(): boolean {
        return this.maxStacks > 1 || this.maxStacks === -1;
    }
}