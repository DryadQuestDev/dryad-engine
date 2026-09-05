<script setup lang="ts">
import { computed } from 'vue';
import { shouldShowEntityIds } from '../../../utils/idBadge';
import { Game } from '../../../game';
import { Global } from '../../../../global/global';
import type { Status } from '../../../core/character/status';
import type { Character } from '../../../core/character/character';
import type { EntityStatObject } from '../../../../schemas/entityStatSchema';

const showIds = computed(() => shouldShowEntityIds());

const props = defineProps<{
    statId: string;
    characterId?: string;
}>();

const game = Game.getInstance();
const global = Global.getInstance();

const statDef = computed(() => {
    const showHidden = game.coreSystem.getDebugSetting('show_hidden_stats');
    const map = showHidden ? game.characterSystem.statsMap : game.characterSystem.statsVisibleMap;
    return map.get(props.statId);
});

const statCharacter = computed(() => {
    return props.characterId ? game.getCharacter(props.characterId) : undefined;
});

// Rounded to the stat's own precision, the same way getStat rounds the composed total. A stat
// computer is free to return a float (a x1.6 scale on a base of 384 is 230.39999999999998), and
// without this the raw sum reaches the card as +614.4000000000001.
function statusContribution(status: Status, character: Character, stat: EntityStatObject, statId: string): number {
    const stacks = status.currentStacks || 1;
    let v = (status.stats?.[statId] ?? 0) * stacks;
    for (const key of status.computedStatsKeys) {
        const computer = game.characterSystem.getStatComputer(key);
        const computed = computer?.(character);
        v += (computed?.[statId] ?? 0) * stacks;
    }
    return character.applyPrecision(v, stat);
}

function skillStatusName(statusId: string): string | undefined {
    const rest = statusId.slice('_skill_'.length);
    for (const [treeId, tree] of game.characterSystem.skillTreesMap) {
        if (rest.startsWith(treeId + '_')) {
            const slotId = rest.slice(treeId.length + 1);
            const slot = tree.skills?.find((s: any) => s.id === slotId);
            if (slot?.skill) {
                return game.characterSystem.skillSlotsMap.get(slot.skill)?.name;
            }
        }
    }
    return undefined;
}

function itemStatusName(statusId: string, character: Character): string | undefined {
    const uid = statusId.slice('item_'.length);
    const item = character.getPartyInventory()?.getItemByUid(uid);
    return item?.getName();
}

type Row = { key: string; name: string; value: number };
type Group = { label: string; rows: Row[] };

const breakdown = computed<Group[]>(() => {
    const character = statCharacter.value;
    if (!character || !statDef.value) return [];

    const statId = props.statId;
    const coreStatus = character.getCoreStatus();
    const base: Row[] = [];
    const items: Row[] = [];
    const skills: Row[] = [];
    const permanent: Row[] = [];
    const duration: Row[] = [];

    for (const status of character.getStatuses()) {
        const v = statusContribution(status, character, statDef.value, statId);
        if (!v) continue;

        if (status === coreStatus) {
            base.push({ key: status.id || '_core', name: global.getString('stat_breakdown.base'), value: v });
        } else if (status.id.startsWith('item_')) {
            items.push({ key: status.id, name: itemStatusName(status.id, character) || status.name || status.id, value: v });
        } else if (status.id.startsWith('_skill_')) {
            skills.push({ key: status.id, name: skillStatusName(status.id) || status.name || status.id, value: v });
        } else {
            const d = status.duration;
            const isPermanent = d === -1 || d === undefined;
            const target = isPermanent ? permanent : duration;
            target.push({ key: status.id, name: status.name || status.id, value: v });
        }
    }

    const groups: Group[] = [];
    if (base.length) groups.push({ label: '', rows: base });
    if (items.length) groups.push({ label: global.getString('stat_breakdown.items'), rows: items });
    if (skills.length) groups.push({ label: global.getString('stat_breakdown.skills'), rows: skills });
    if (permanent.length) groups.push({ label: global.getString('stat_breakdown.permanent'), rows: permanent });
    if (duration.length) groups.push({ label: global.getString('stat_breakdown.duration'), rows: duration });
    return groups;
});

function formatSigned(n: number): string {
    if (n > 0) return `+${n}`;
    return String(n);
}
</script>

<template>
    <div v-if="statDef" class="popup-inner">
        <div class="popup-header">
            <span class="popup-title">{{ statDef.name || statId }}
                <span v-if="showIds" class="entity-id-badge">{{ statId }}</span>
            </span>
        </div>
        <div class="popup-body">
            <div v-if="statDef.ingame_description" v-script="{ html: statDef.ingame_description, context: { character: statCharacter } }" class="popup-description"></div>
            <div v-if="breakdown.length" class="stat-breakdown">
                <template v-for="(group, gi) in breakdown" :key="gi">
                    <div v-if="group.label" class="stat-breakdown-group">{{ group.label }}</div>
                    <div v-for="row in group.rows" :key="row.key" class="stat-breakdown-row">
                        <span class="stat-breakdown-name">{{ row.name }}:</span>
                        <span class="stat-breakdown-value" :class="row.value >= 0 ? 'positive' : 'negative'">{{ formatSigned(row.value) }}</span>
                    </div>
                </template>
            </div>
        </div>
    </div>
    <div v-else class="popup-inner popup-error">
        Unknown stat: {{ statId }}
    </div>
</template>

<style scoped>
.stat-breakdown {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.stat-breakdown-group {
    margin-top: 4px;
    font-size: 0.85em;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.stat-breakdown-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.95em;
}

.stat-breakdown-name {
    color: #ddd;
}

.stat-breakdown-value.positive {
    color: #42b983;
}

.stat-breakdown-value.negative {
    color: #e06c75;
}
</style>
