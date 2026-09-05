import { ref, Ref, Component } from 'vue';
import { Skip } from '../../utility/save-system';
import { gameLogger } from '../utils/logger';
import { Global } from '../../global/global';
import type { Game } from '../game';
import type { AccoladeObject } from '../../schemas/accoladeSchema';
import type { AccoladeTierObject } from '../../schemas/accoladeTierSchema';
import type { AccoladeGroupObject } from '../../schemas/accoladeGroupSchema';

/**
 * AccoladeSystem — achievements, minimal by design.
 *
 * Each accolade entry owns a single progress number in a save-scoped map; completion is
 * `progress >= target`. Games do ALL tracking themselves (emitter listeners plus their own
 * stores) and call the mutate API — the engine only stores progress, pops the unlock
 * notification, and renders the tab. Plugins ship no achievements; their contribution is
 * that useful signals are covered by emitters.
 */
export class AccoladeSystem {

    /** Saved: accolade id → progress. Bare Ref<Map> — @Populate(Map) would construct values as Maps on load. */
    progress: Ref<Map<string, number>> = ref(new Map());

    // Editor data (accolades / accolade_tiers / accolade_groups files), set by the data loader.
    @Skip() accolades = new Map<string, AccoladeObject>();
    @Skip() tiers = new Map<string, AccoladeTierObject>();
    @Skip() groups = new Map<string, AccoladeGroupObject>();

    /** Runtime targets for rows authored with target 0/empty — recomputed by game scripts each boot. */
    @Skip() private runtimeTargets = new Map<string, number>();

    /** tag → accolade ids, built from the data rows. */
    @Skip() private byTag = new Map<string, string[]>();

    /** Accolade ids waiting to present, in unlock order. Reactive for the toast component. */
    @Skip() toastQueue: Ref<string[]> = ref([]);

    @Skip() private game!: Game;
    @Skip() private uiComponents: { tab: Component; toast: Component } | null = null;

    public init(game: Game, uiComponents: { tab: Component; toast: Component }): void {
        this.game = game;
        this.uiComponents = uiComponents;
    }

    /** Called from the data loader. The feature is opt-in by data: no accolades, no tabs. */
    public initData(
        accolades: Map<string, AccoladeObject>,
        tiers: Map<string, AccoladeTierObject>,
        groups: Map<string, AccoladeGroupObject>,
    ): void {
        this.accolades = accolades;
        this.tiers = tiers;
        this.groups = groups;
        this.byTag.clear();
        for (const def of accolades.values()) {
            // Set-dedupe: the data merge concatenates a mod's restated tags array.
            for (const tag of new Set(def.tags ?? [])) {
                if (!this.byTag.has(tag)) this.byTag.set(tag, []);
                this.byTag.get(tag)!.push(def.id);
            }
        }
        if (this.uiComponents && this.accolades.size > 0) {
            this.game.coreSystem.addComponent({
                id: 'accolades', slot: 'progression-tabs', title: this.line('progression.tab.accolades'),
                component: this.uiComponents.tab, order: 25,
            });
            this.game.coreSystem.addComponent({
                id: 'accolade-toast', slot: 'ui-container',
                component: this.uiComponents.toast,
            });
        }
    }

    /** A locale line: the game's own entry when it ships one (getLine returns "[id]" when it doesn't), else the engine locale. */
    public line(id: string): string {
        const value = this.game.getLine(id);
        return !value || value.startsWith('[') ? Global.getInstance().getString(id) : value;
    }

    /** Reward points an accolade is worth: its own, else its tier's default. */
    public getAccoladePoints(id: string): number {
        const def = this.accolades.get(id);
        if (!def || def.disabled) return 0;
        return def.points || (def.tier ? this.tiers.get(def.tier)?.points || 0 : 0);
    }

    /** Reward points earned so far — the sum over completed accolades. */
    public getEarnedPoints(): number {
        let total = 0;
        for (const id of this.accolades.keys()) {
            if (this.isAccoladeCompleted(id)) total += this.getAccoladePoints(id);
        }
        return total;
    }

    /** Reward points on offer across the whole catalog. */
    public getTotalPoints(): number {
        let total = 0;
        for (const def of this.accolades.values()) {
            if (!def.disabled) total += this.getAccoladePoints(def.id);
        }
        return total;
    }

    /** Gallery replays run scene actions for real, and debug seeding shouldn't earn achievements. */
    private canWrite(): boolean {
        return !this.game.getState('replay_mode') && !this.game.getState('accolades_frozen');
    }

    /** Effective target: runtime-set value wins over the data row; 0 = no target yet, cannot complete. */
    public getAccoladeTarget(id: string): number {
        return this.runtimeTargets.get(id) ?? (this.accolades.get(id)?.target || 0);
    }

    public getAccoladeProgress(id: string): number {
        return this.progress.value.get(id) || 0;
    }

    public isAccoladeCompleted(id: string): boolean {
        const def = this.accolades.get(id);
        if (!def || def.disabled) return false;
        const target = this.getAccoladeTarget(id);
        return target > 0 && this.getAccoladeProgress(id) >= target;
    }

    /** For rows authored with target 0/empty — the game computes the target from data (e.g. "wear every outfit"). */
    public setAccoladeTarget(id: string, target: number): void {
        if (!Number.isFinite(target) || target < 0) return;
        this.runtimeTargets.set(id, Math.floor(target));
    }

    public progressAccolade(id: string, delta: number = 1): void {
        if (!Number.isFinite(delta) || delta <= 0) return;
        this.setAccoladeProgress(id, this.getAccoladeProgress(id) + delta);
    }

    /** Ids of every accolade carrying the tag (empty array for unknown tags). */
    public getAccoladesByTag(tag: string): string[] {
        return this.byTag.get(tag) ?? [];
    }

    /** progressAccolade for every accolade carrying the tag — one call advances a whole tier family. */
    public progressAccoladesByTag(tag: string, delta: number = 1): void {
        for (const id of this.getAccoladesByTag(tag)) this.progressAccolade(id, delta);
    }

    /** setAccoladeProgress for every accolade carrying the tag. */
    public setAccoladeProgressByTag(tag: string, value: number): void {
        for (const id of this.getAccoladesByTag(tag)) this.setAccoladeProgress(id, value);
    }

    /** Absolute set — only ever raises, so out-of-order writes can't regress progress. */
    public setAccoladeProgress(id: string, value: number): void {
        if (!this.canWrite() || !Number.isFinite(value)) return;
        const def = this.accolades.get(id);
        if (!def) {
            gameLogger.error(`setAccoladeProgress: unknown accolade "${id}"`);
            return;
        }
        if (def.disabled) return;
        const prev = this.getAccoladeProgress(id);
        const target = this.getAccoladeTarget(id);
        // Clamp at target when one exists so completed counters read exactly "target / target".
        const next = target > 0 ? Math.min(value, target) : value;
        if (next <= prev) return;
        this.progress.value.set(id, next);
        if (target > 0 && prev < target && next >= target) {
            this.toastQueue.value.push(id);
            // Games hand out whatever an achievement should actually pay — the engine only
            // scores the points and announces the moment.
            this.game.trigger('accolade_completed', id, this.getAccoladePoints(id));
        }
    }
}
