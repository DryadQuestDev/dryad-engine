import { CharacterStatusObject } from '../../../schemas/characterStatusSchema';
import { Game } from '../../game';
import { BaseStatusObject } from '../../../schemas/characterStatusSchema';

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
    public spineViews: Map<string, { atlas: string, skeleton: string, animation: string }> = new Map();


    public setValues(obj: CharacterStatusObject | BaseStatusObject) {
        this.traits = obj.traits || {};
        this.attributes = obj.attributes || {};
        this.skinLayers = new Set(obj.skin_layers || []);
        this.abilities = new Set(obj.abilities || []);
        this.stats = obj.stats || {};

        // Spine configs: array of { id, view?, atlas, skeleton, default_animation }
        if (obj.spine && Array.isArray(obj.spine)) {
            for (const entry of obj.spine) {
                if (entry.atlas && entry.skeleton) {
                    const key = entry.view || '';
                    this.spineViews.set(key, {
                        atlas: entry.atlas,
                        skeleton: entry.skeleton,
                        animation: entry.default_animation || '',
                    });
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