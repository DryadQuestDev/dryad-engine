<script setup lang="ts">
import { computed } from 'vue';
import { shouldShowEntityIds } from '../../../utils/idBadge';
import { Game } from '../../../game';
import { closeAll } from '../popupStore';

const showIds = computed(() => shouldShowEntityIds());

const props = defineProps<{
    recordId: string;
}>();

const game = Game.getInstance();

const record = computed(() => game.getRecord(props.recordId));
const summarySource = computed(() => {
    const r = record.value;
    if (!r) return '';
    return r.summary || r.content || '';
});

const discoveredChildren = computed(() => game.getDiscoveredChildren(props.recordId));

function childBody(child: { summary?: string; content?: string }): string {
    return child.summary || child.content || '';
}

function onOpenInEncyclopedia() {
    game.openEncyclopediaForRecord(props.recordId);
    closeAll();
}
</script>

<template>
    <div v-if="record" class="popup-inner">
        <div class="popup-header">
            <button v-if="game.isRecordInEncyclopedia(recordId)" class="popup-action"
                @click="onOpenInEncyclopedia" aria-label="Open in Encyclopedia">
                <i class="pi pi-book"></i>
            </button>
            <span class="popup-title">{{ record.title }}
                <span v-if="showIds" class="entity-id-badge">{{ recordId }}</span>
            </span>
        </div>
        <div v-script="summarySource" class="popup-body"></div>
        <template v-for="child in discoveredChildren" :key="child.id">
            <hr class="record-child-sep">
            <div class="record-child-title">{{ child.title }}</div>
            <div v-script="childBody(child)" class="popup-body"></div>
        </template>
    </div>
    <div v-else class="popup-inner popup-error">
        Unknown record: {{ recordId }}
    </div>
</template>

<style scoped>
.popup-header {
    justify-content: flex-start;
}

.popup-body :deep(p) {
    margin: 0 0 8px;
}

.popup-body :deep(p:last-child) {
    margin-bottom: 0;
}

.record-child-sep {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 10px 0 6px;
}

.record-child-title {
    font-weight: 600;
    color: var(--theme-primary, #5dadec);
    font-size: 0.95em;
    margin-bottom: 4px;
    letter-spacing: 0.2px;
}
</style>
