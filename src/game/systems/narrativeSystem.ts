import { ref } from "vue";
import { Game } from "../game";
import { Skip } from "../../utility/save-system";
import { gameLogger } from "../utils/logger";
import { NarrativeSlotObject, NarrativeStateObject, NarrativeSegmentObject } from "../../schemas/narrativeSchema";
import { RecordObject } from "../../schemas/recordSchema";
import { EncyclopediaTreeObject } from "../../schemas/encyclopediaTreeSchema";

export class NarrativeSystem {

    get game(): Game {
        return Game.getInstance();
    }

    // State registry: game scripts register evaluator functions for state IDs
    @Skip()
    private stateRegistry = new Map<string, Function>();

    // Anti-repeat tracking: last 2 segment IDs per slot
    @Skip()
    private recentBySlot = new Map<string, string[]>();

    // Pre-indexed segments grouped by slot type for O(1) lookup
    @Skip()
    private segmentsByType = new Map<string, NarrativeSegmentObject[]>();

    @Skip()
    public recordsMap = new Map<string, RecordObject>();

    @Skip()
    public encyclopediaTreesMap = new Map<string, EncyclopediaTreeObject>();

    /** Index of record id → first owning tree id (cross-listed records take the lowest-order tree). Built once at game init. */
    @Skip()
    public encyclopediaRecordIndex = new Map<string, { treeId: string }>();

    public discoveredRecords: Set<string> = new Set();

    /** Encyclopedia UI state (persisted in save). The Encyclopedia tab binds directly to these. */
    public selectedEncyclopediaTreeId = ref<string | null>(null);
    public selectedEncyclopediaRecordId = ref<string | null>(null);

    // ============================================================================
    // Public API
    // ============================================================================

    public registerState(id: string, evaluator: Function): void {
        const statesMap = this.game.coreSystem.dataRegistry.get('narrative_states') as Map<string, NarrativeStateObject> | undefined;
        if (statesMap && !statesMap.has(id)) {
            gameLogger.error(`registerNarrativeState("${id}") — no matching state definition found in narrative_states. Check for typos.`);
        }
        this.stateRegistry.set(id, evaluator);
    }

    public buildSegmentIndex(): void {
        this.segmentsByType.clear();
        const segmentsMap = this.game.coreSystem.dataRegistry.get('narrative_segments') as Map<string, NarrativeSegmentObject> | undefined;
        if (segmentsMap) {
            for (const [, seg] of segmentsMap) {
                if (!seg.type) continue;
                let arr = this.segmentsByType.get(seg.type);
                if (!arr) { arr = []; this.segmentsByType.set(seg.type, arr); }
                arr.push(seg);
            }
        }
    }

    /**
     * Resolve a narrative slot by selecting the best matching segment.
     * Pipeline: collect by slot → filter by gates → score identity →
     *           weighted random from top tier → anti-repeat → resolve content.
     */
    public resolveSlot(slotType: string, args: string[] = []): string {
        const slotsMap = this.game.coreSystem.dataRegistry.get('narrative_slots') as Map<string, NarrativeSlotObject> | undefined;
        const statesMap = this.game.coreSystem.dataRegistry.get('narrative_states') as Map<string, NarrativeStateObject> | undefined;

        const slot = slotsMap?.get(slotType);
        if (!slot) {
            gameLogger.error(`Unknown narrative slot type "${slotType}" — not registered in narrative_slots.`);
            return '';
        }

        const isDevMode = this.game.isDevMode();

        // 1. Collect segments for this slot, filter by gates, score specificity
        const candidates: { segment: NarrativeSegmentObject; specificity: number }[] = [];
        const debugRows: { id: string; specificity: number | string; status: string }[] = [];

        const slotSegments = this.segmentsByType.get(slotType) || [];
        for (const seg of slotSegments) {
            const result = this.evaluateStates(seg, statesMap);
            if (!result.pass) {
                if (isDevMode) debugRows.push({ id: seg.id, specificity: '—', status: 'gate fail' });
                continue;
            }

            candidates.push({ segment: seg, specificity: result.specificity });
            if (isDevMode) debugRows.push({ id: seg.id, specificity: result.specificity, status: 'pass' });
        }

        if (candidates.length === 0) {
            if (isDevMode) {
                console.groupCollapsed(`%c[Narrative] |@${slotType}| → fallback`, 'color: #888');
                if (debugRows.length > 0) console.table(debugRows);
                else console.log('No segments defined for this slot.');
                console.groupEnd();
            }
            return this.resolveFallback(slot);
        }

        // 2. Keep only max specificity tier
        const maxSpecificity = Math.max(...candidates.map(c => c.specificity));
        const topTier = candidates.filter(c => c.specificity === maxSpecificity);

        // 3. Anti-repeat filter (last 2 per slot)
        const recent = this.recentBySlot.get(slotType) || [];
        let filtered = topTier.filter(c => !recent.includes(c.segment.id));
        if (filtered.length === 0) {
            this.recentBySlot.set(slotType, []);
            filtered = topTier;
        }

        // 4. Weighted random selection
        const chosen = this.weightedSelect(filtered);
        if (!chosen) return this.resolveFallback(slot);

        // 5. Track for anti-repeat
        recent.push(chosen.segment.id);
        if (recent.length > 2) recent.shift();
        this.recentBySlot.set(slotType, recent);

        // Dev mode: log selection table
        if (isDevMode) {
            // Mark winner and anti-repeat filtered in debug rows
            for (const row of debugRows) {
                if (row.id === chosen.segment.id) {
                    row.status = '★ winner';
                } else if (row.status === 'pass' && Number(row.specificity) < maxSpecificity) {
                    row.status = 'outranked';
                }
            }
            console.groupCollapsed(`%c[Narrative] |@${slotType}| → ${chosen.segment.id}`, 'color: #4CAF50');
            console.table(debugRows);
            console.groupEnd();
        }

        // 6. Substitute slot arguments ($1, $2, ...) then resolve through full pipeline
        let content = chosen.segment.content || '';
        for (let i = 0; i < args.length; i++) {
            content = content.replaceAll(`$${i + 1}`, args[i]);
        }
        return this.game.logicSystem.resolveString(content).output;
    }

    // ============================================================================
    // State evaluation (gates + identity)
    // ============================================================================

    private evaluateStates(
        segment: NarrativeSegmentObject,
        statesMap: Map<string, NarrativeStateObject> | undefined
    ): { pass: boolean; specificity: number } {
        if (!statesMap) return { pass: true, specificity: 0 };

        let specificity = 0;

        // Hard gates — mismatch eliminates
        const gates = segment.gates as Record<string, any> | undefined;
        if (gates) {
            for (const stateId in gates) {
                const result = this.evaluateSingleState(stateId, gates[stateId], statesMap, false);
                if (result === false) return { pass: false, specificity: 0 };
                if (result !== null) specificity += result;
            }
        }

        // Soft identity — mismatch ignored, match adds specificity
        const identity = segment.identity as Record<string, any> | undefined;
        if (identity) {
            for (const stateId in identity) {
                const result = this.evaluateSingleState(stateId, identity[stateId], statesMap, true);
                if (result !== null && result !== false) specificity += result;
            }
        }

        return { pass: true, specificity };
    }

    /**
     * Evaluate a single state against its registered evaluator.
     * @returns specificity bonus (number), false (hard fail), or null (unfilled/skip)
     */
    private evaluateSingleState(
        stateId: string,
        stateValue: any,
        statesMap: Map<string, NarrativeStateObject>,
        isIdentity: boolean
    ): number | false | null {
        const stateDef = statesMap.get(stateId);
        if (!stateDef?.type) return null;

        // Check if this state is "filled" (actively constraining)
        if (!this.isStateFilled(stateDef.type, stateValue)) return null;

        // Evaluator must exist for filled states
        const evaluator = this.stateRegistry.get(stateId);
        if (!evaluator) {
            gameLogger.error(`Narrative state "${stateId}" is filled but has no registered evaluator. Call game.registerNarrativeState("${stateId}", evaluator).`);
            return isIdentity ? null : false;
        }

        const currentValue = evaluator();
        const stateSpecificity = stateDef.specificity ?? 1;

        switch (stateDef.type) {
            case 'boolean':
                if (currentValue !== stateValue) return isIdentity ? null : false;
                break;
            case 'number':
                if (currentValue !== stateValue) return isIdentity ? null : false;
                break;
            case 'range': {
                const range = stateValue as { min?: number; max?: number };
                if (range.min != null && currentValue < range.min) return isIdentity ? null : false;
                if (range.max != null && currentValue > range.max) return isIdentity ? null : false;
                break;
            }
            case 'chooseOne':
                if (currentValue !== stateValue) return isIdentity ? null : false;
                break;
            case 'chooseMany':
            case 'array': {
                const required = Array.isArray(stateValue) ? stateValue : [];
                const stateArr = Array.isArray(currentValue) ? currentValue : [];
                if (isIdentity) {
                    // Identity: per-overlap scoring — each matching tag adds specificity
                    const overlapCount = required.filter((val: string) => stateArr.includes(val)).length;
                    if (overlapCount === 0) return null;
                    return overlapCount * stateSpecificity;
                } else {
                    // Gate: must include ALL
                    for (const val of required) {
                        if (!stateArr.includes(val)) return false;
                    }
                }
                break;
            }
            default:
                return null;
        }

        return stateSpecificity;
    }

    /**
     * Determine if a state value is "filled" (actively constraining).
     * Unfilled states are ignored — segments with fewer filled states have lower specificity.
     */
    private isStateFilled(type: string, value: any): boolean {
        switch (type) {
            case 'boolean':
                return typeof value === 'boolean';
            case 'number':
                return value != null;
            case 'range': {
                if (!value || typeof value !== 'object') return false;
                return value.min != null || value.max != null;
            }
            case 'chooseOne':
                return typeof value === 'string' && value.length > 0;
            case 'chooseMany':
            case 'array':
                return Array.isArray(value) && value.length > 0;
            default:
                return false;
        }
    }

    // ============================================================================
    // Helpers
    // ============================================================================

    private resolveFallback(slot: NarrativeSlotObject): string {
        return slot.fallback_content
            ? this.game.logicSystem.resolveString(slot.fallback_content).output
            : '';
    }

    private weightedSelect(
        candidates: { segment: NarrativeSegmentObject; specificity: number }[]
    ): { segment: NarrativeSegmentObject; specificity: number } | null {
        if (candidates.length === 0) return null;

        const totalWeight = candidates.reduce((sum, c) => sum + (c.segment.weight || 1), 0);
        if (totalWeight <= 0) return null;

        let random = Math.random() * totalWeight;
        for (const candidate of candidates) {
            random -= candidate.segment.weight || 1;
            if (random <= 0) return candidate;
        }

        return candidates[candidates.length - 1];
    }

    // ============================================================================
    // Records / Encyclopedia
    // ============================================================================

    public getRecord(id: string): RecordObject | undefined {
        return this.recordsMap.get(id);
    }

    public discoverRecord(id: string): void {
        if (this.discoveredRecords.has(id)) return;
        const record = this.recordsMap.get(id);
        if (!record) {
            gameLogger.error(`discoverRecord("${id}") — no such record.`);
            return;
        }
        this.discoveredRecords.add(id);
    }

    public isRecordDiscovered(id: string): boolean {
        const record = this.recordsMap.get(id);
        if (!record) return false;
        if (record.auto_discovery) return true;
        return this.discoveredRecords.has(id);
    }

    /**
     * Children of `parentId` that the player has discovered, in discovery order
     * (Set preserves insertion order). Auto-discovery children — rare — append
     * at the end in record-definition order. Used by RecordCard and the
     * Encyclopedia tab to render the parent entry with its layered addendums.
     */
    public getDiscoveredChildren(parentId: string): RecordObject[] {
        const result: RecordObject[] = [];
        const seen = new Set<string>();
        for (const id of this.discoveredRecords) {
            const r = this.recordsMap.get(id);
            if (r?.parent_record === parentId) {
                result.push(r);
                seen.add(id);
            }
        }
        for (const r of this.recordsMap.values()) {
            if (r.parent_record === parentId && r.auto_discovery && !seen.has(r.id)) {
                result.push(r);
            }
        }
        return result;
    }

    /** Walk encyclopedia trees once and index each record id → first owning tree. Call after `encyclopediaTreesMap` is populated. */
    public buildEncyclopediaIndex(): void {
        this.encyclopediaRecordIndex.clear();
        for (const tree of this.encyclopediaTreesMap.values()) {
            for (const group of tree.groups || []) {
                for (const entry of group.records || []) {
                    if (!entry.record) continue;
                    if (this.encyclopediaRecordIndex.has(entry.record)) continue;
                    this.encyclopediaRecordIndex.set(entry.record, { treeId: tree.id });
                }
            }
        }
    }

    public isRecordInEncyclopedia(id: string): boolean {
        return this.encyclopediaRecordIndex.has(id);
    }

    public openInEncyclopedia(recordId: string): void {
        const entry = this.encyclopediaRecordIndex.get(recordId);
        if (!entry) return;
        this.selectedEncyclopediaTreeId.value = entry.treeId;
        this.selectedEncyclopediaRecordId.value = recordId;
    }
}
