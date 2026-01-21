import { CharacterStatusObject } from '../../../schemas/characterStatusSchema';
import { Game } from '../../game';
import { BaseStatusObject } from '../../../schemas/characterStatusSchema';

export class Status {
    public id: string = "";
    public maxStacks: number = 1; // -1 for unlimited
    public currentStacks: number = 1;
    public image: string = "";

    // todo: implement
    public isHidden: boolean = false;

    // TODO: or turn it into type 'exploration' | 'combat'??
    public expirationTrigger: 'none' | 'exploration' | 'combat' = 'none';

    // add actual field to track expiration time, like expirationTime: number = 10;
    public duration: number = -1;

    public stats: Record<string, number> = {};
    public traits: Record<string, any> = {};
    public attributes: Record<string, string> = {};
    public skinLayers: Set<string> = new Set();
    public abilities: Set<string> = new Set();
    public abilityModifiers: BaseStatusObject['ability_modifiers'] = [];


    public setValues(obj: CharacterStatusObject | BaseStatusObject) {
        this.traits = obj.traits || {};
        this.attributes = obj.attributes || {};
        this.skinLayers = new Set(obj.skin_layers || []);
        this.abilities = new Set(obj.abilities || []);
        this.stats = obj.stats || {};
        this.abilityModifiers = obj.ability_modifiers || [];

        // If CharacterStatusObject is passed, also set status values
        if ('max_stacks' in obj && obj.max_stacks !== undefined) {
            this.maxStacks = obj.max_stacks;
            this.image = obj.image || "";
        }

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