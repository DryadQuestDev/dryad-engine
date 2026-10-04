<script setup lang="ts">
import { computed } from 'vue';
import { shouldShowEntityIds } from '../../../utils/idBadge';
import { Game } from '../../../game';
import { Global } from '../../../../global/global';
import StatusObjectDisplay from '../../progression/StatusObjectDisplay.vue';
import { Item } from '../../../core/character/item';

const showIds = computed(() => shouldShowEntityIds());

const props = defineProps<{
    statusId: string;
    characterId?: string;
    statusInstanceIndex?: number;
    // Optional chip shown left of the title (e.g. "Consume") + an explicit stack count for previews
    // where the status isn't applied yet (the item card's "granted on consume" list).
    titleChip?: string;
    stacksOverride?: number;
    // The item this card was opened from (a link in its description, its consume list). Handed to
    // the status_preview emitter so a game can show the status as that item will grant it.
    sourceItem?: Item;
}>();

const game = Game.getInstance();
const global = Global.getInstance();

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

// Remaining duration. Falls back to the template's own value for the preview path (the item card's
// "granted on consume" list), where nothing is applied yet — apply_statuses_on_consume carries no
// duration of its own, so the template's is what the player will actually get.
const duration = computed((): number => {
    const live = statusLiveInstance.value;
    if (!live) return Number(statusDef.value?.duration) || 0;
    const idx = props.statusInstanceIndex;
    if (idx !== undefined && live.multiStack) {
        return live.getInstances()[idx]?.duration ?? live.duration;
    }
    return live.duration;
});

// Only a positive duration is a countdown: -1 is permanent and 0 is passive, and tickDuration
// leaves both alone. Ceil because the real-time battler drains by a partial turn — the same
// rounding StatusBrick's badge uses, or the brick and its card would disagree by a turn.
const shownDuration = computed((): number => duration.value > 0 ? Math.ceil(duration.value) : 0);

const rarity = computed((): string => statusLiveInstance.value?.rarity || '');

const mergedStats = computed((): Record<string, number> => {
    const live = statusLiveInstance.value;
    const baseStats = (live?.stats ?? statusDef.value?.stats ?? {}) as Record<string, number>;
    const merged: Record<string, number> = { ...baseStats };
    // Not applied yet: the template's numbers may not be what the player will get (a status scaled
    // by the item that grants it), so the game may rewrite this copy first.
    if (!live) game.trigger('status_preview', props.statusId, merged, { item: props.sourceItem, character: statusCharacter.value ?? undefined });
    const computedKeys = live?.computedStatsKeys ?? statusDef.value?.computed_stats ?? [];
    const char = statusCharacter.value;
    if (computedKeys.length && char) {
        for (const key of computedKeys) {
            const computer = game.characterSystem.getStatComputer(key);
            if (!computer) continue;
            const computed = computer(char);
            for (const k in computed) merged[k] = (merged[k] || 0) + computed[k];
        }
        // Round to each stat's own precision, as getStat does for the composed total — a computer
        // returning a float would otherwise print binary-float noise (+614.4000000000001).
        for (const k in merged) {
            const def = game.characterSystem.statsMap.get(k);
            if (def) merged[k] = char.applyPrecision(merged[k], def);
        }
    }
    return merged;
});

const stacksLabel = computed(() => global.getString('status_card.stacks', { stacks: shownStacks.value }));

const unknownLabel = computed(() => global.getString('card.unknown', { id: props.statusId }));

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
                <span v-if="shownStacks > 1" class="popup-stack-count">{{ stacksLabel }}</span>
                <span v-if="showIds" class="entity-id-badge">{{ statusId }}</span>
            </span>
            <span v-if="shownDuration > 0" class="popup-duration">
                <i class="pi pi-hourglass"></i>{{ shownDuration }}
            </span>
        </div>
        <div class="popup-body">
            <div v-if="description" v-script="{ html: description, context: { character: statusCharacter } }" class="popup-description"></div>
            <StatusObjectDisplay :data="displayData" :stacks="shownStacks" :character-id="characterId" />
        </div>
    </div>
    <div v-else class="popup-inner popup-error">
        {{ unknownLabel }}
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

.popup-duration {
    /* Pinned right by its own margin rather than by the header's space-between: ItemCard's inline
       "granted on consume" list overrides the header to justify-content: flex-start. */
    margin-left: auto;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: bold;
    font-size: 0.9em;
    white-space: nowrap;
    /* The same grey as StatusBrick's .duration-count badge, so this number reads as the number on
       the brick the card was opened from. */
    color: #999;
}

.popup-duration .pi {
    font-size: 0.85em;
}

/* .popup-close-overlay is absolute at top:4px right:6px and ~28px wide, and only rendered on a
   closable (pinned) popup — where the chip would otherwise sit underneath it. */
.popup[data-closable] .popup-duration {
    margin-right: 26px;
}
</style>
