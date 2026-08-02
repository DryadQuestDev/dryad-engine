<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../../game';
import StatusObjectDisplay from '../../progression/StatusObjectDisplay.vue';

const props = defineProps<{
    statusId: string;
    characterId?: string;
    statusInstanceIndex?: number;
    // Optional chip shown left of the title (e.g. "Consume") + an explicit stack count for previews
    // where the status isn't applied yet (the item card's "granted on consume" list).
    titleChip?: string;
    stacksOverride?: number;
}>();

const game = Game.getInstance();

const statusDef = computed(() => {
    const map = game.getData('character_statuses', true) as Map<string, any> | undefined;
    return map?.get(props.statusId);
});

const statusCharacter = computed(() => {
    return props.characterId ? game.getCharacter(props.characterId) : undefined;
});

const statusLiveInstance = computed(() => {
    return statusCharacter.value?.getStatus(props.statusId);
});

const title = computed(() => {
    return statusLiveInstance.value?.name || statusDef.value?.name || props.statusId;
});

const description = computed(() => {
    return statusLiveInstance.value?.description || statusDef.value?.description || '';
});

const stacks = computed((): number => {
    const live = statusLiveInstance.value;
    if (!live) return 1;
    const idx = props.statusInstanceIndex;
    if (idx !== undefined && live.multiStack) {
        return live.getInstances()[idx]?.stacks ?? live.currentStacks;
    }
    return live.currentStacks;
});

// Stacks shown in the title: an explicit override (preview) wins; otherwise the live stackable count.
const shownStacks = computed((): number => {
    if (props.stacksOverride !== undefined) return props.stacksOverride;
    return statusLiveInstance.value?.isStackable() ? stacks.value : 1;
});

const rarity = computed((): string => statusLiveInstance.value?.rarity || '');

const mergedStats = computed((): Record<string, number> => {
    const live = statusLiveInstance.value;
    const baseStats = (live?.stats ?? statusDef.value?.stats ?? {}) as Record<string, number>;
    const merged: Record<string, number> = { ...baseStats };
    const computedKeys = live?.computedStatsKeys ?? statusDef.value?.computed_stats ?? [];
    const char = statusCharacter.value;
    if (computedKeys.length && char) {
        for (const key of computedKeys) {
            const computer = game.characterSystem.getStatComputer(key);
            if (!computer) continue;
            const computed = computer(char);
            for (const k in computed) merged[k] = (merged[k] || 0) + computed[k];
        }
    }
    return merged;
});

const displayData = computed(() => {
    const live = statusLiveInstance.value;
    return {
        stats: mergedStats.value,
        abilities: live ? [...live.abilities] : (statusDef.value?.abilities ?? []),
        ability_modifiers: live?.abilityModifiers ?? statusDef.value?.ability_modifiers ?? [],
    };
});
</script>

<template>
    <div v-if="statusDef || statusLiveInstance" class="popup-inner">
        <div class="popup-header">
            <span v-if="titleChip" class="popup-title-chip">{{ titleChip }}</span>
            <span class="popup-title" :class="rarity ? ['item-name', 'rarity_' + rarity] : []">
                {{ title }}
                <span v-if="shownStacks > 1" class="popup-stack-count">x{{ shownStacks }}</span>
            </span>
        </div>
        <div class="popup-body">
            <div v-if="description" v-script="{ html: description, context: { character: statusCharacter } }" class="popup-description"></div>
            <StatusObjectDisplay :data="displayData" :stacks="shownStacks" :character-id="characterId" />
        </div>
    </div>
    <div v-else class="popup-inner popup-error">
        Unknown status: {{ statusId }}
    </div>
</template>

<style scoped>
.popup-title-chip {
    display: inline-block;
    vertical-align: middle;
    margin-right: 6px;
    font-size: 0.68em;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #42b983;
    background: rgba(66, 185, 131, 0.14);
    border: 1px solid rgba(66, 185, 131, 0.4);
    border-radius: 6px;
    padding: 1px 6px;
    white-space: nowrap;
}
</style>
