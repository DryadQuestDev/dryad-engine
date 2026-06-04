<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../../game';
import { closeAll } from '../popupStore';

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
            <span class="popup-title">{{ record.title }}</span>
        </div>
        <div v-script="summarySource" class="popup-body"></div>
    </div>
    <div v-else class="popup-inner popup-error">
        Unknown record: {{ recordId }}
    </div>
</template>

<style scoped>
.popup-header {
    justify-content: flex-start;
}
</style>
