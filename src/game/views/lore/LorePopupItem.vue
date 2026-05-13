<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useFloating, offset, flip, shift, size, autoUpdate } from '@floating-ui/vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import { makeSticky, notifyPopupEnter, notifyPopupLeave, closeAll, closeFromDepth } from './lorePopupStore';
import type { PopupEntry } from './lorePopupStore';

const props = defineProps<{ entry: PopupEntry; depth: number }>();

const game = Game.getInstance();
const global = Global.getInstance();
const fontSize = computed(() => `${global.userSettings.value.font_size}px`);

const anchor = ref<HTMLElement | null>(props.entry.anchorEl);
const popupEl = ref<HTMLElement | null>(null);

watch(() => props.entry, (e) => { anchor.value = e.anchorEl; });

const { floatingStyles } = useFloating(anchor, popupEl, {
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [
        offset(6),
        flip({ padding: 8 }),
        shift({ padding: 8 }),
        size({
            padding: 8,
            apply({ availableHeight, elements }) {
                Object.assign(elements.floating.style, {
                    maxHeight: `${Math.max(120, availableHeight)}px`,
                });
            },
        }),
    ],
    whileElementsMounted: autoUpdate,
});

const record = computed(() => game.getRecord(props.entry.recordId));

const summarySource = computed(() => {
    const r = record.value;
    if (!r) return '';
    return r.summary || r.content || '';
});

function onClose() {
    closeFromDepth(props.depth);
}

function onOpenInEncyclopedia() {
    game.openEncyclopediaForRecord(props.entry.recordId);
    closeAll();
}

function onMouseDown() {
    makeSticky();
}

function onPopupEnter() {
    notifyPopupEnter(props.depth);
}

function onPopupLeave() {
    notifyPopupLeave(props.depth);
}
</script>

<template>
    <div ref="popupEl" class="lore-popup" v-bind="{ 'data-depth': depth }"
        :style="[floatingStyles, { zIndex: 4000 + depth }]" @mouseenter="onPopupEnter" @mouseleave="onPopupLeave"
        @mousedown="onMouseDown">
        <div v-if="record" class="lore-popup-inner">
            <div class="lore-popup-header">
                <span class="lore-popup-title">{{ record.title }}</span>
                <div class="lore-popup-actions">
                    <button v-if="game.isRecordInEncyclopedia(entry.recordId)" class="lore-popup-action"
                        @click="onOpenInEncyclopedia" aria-label="Open in Encyclopedia">
                        <i class="pi pi-book"></i>
                    </button>
                    <button class="lore-popup-close" @click="onClose" aria-label="Close">×</button>
                </div>
            </div>
            <div v-script="summarySource" class="lore-popup-body"></div>
        </div>
        <div v-else class="lore-popup-inner lore-popup-error">
            Unknown record: {{ entry.recordId }}
        </div>
    </div>
</template>

<style scoped>
.lore-popup {
    position: fixed;
    pointer-events: auto;
    max-width: 360px;
    min-width: 220px;
    background: linear-gradient(135deg, rgba(15, 15, 28, 0.96) 0%, rgba(25, 25, 45, 0.96) 100%);
    border: 1px solid var(--theme-primary, #5dadec);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    color: #e8e8f0;
    font-size: v-bind(fontSize);
    line-height: 1.5;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.lore-popup-inner {
    padding: 10px 14px 12px;
}

.lore-popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.lore-popup-title {
    font-weight: 600;
    color: var(--theme-primary, #5dadec);
    letter-spacing: 0.3px;
}

.lore-popup-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.lore-popup-action {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 1em;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.lore-popup-action:hover {
    color: var(--theme-primary, #5dadec);
    background: rgba(255, 255, 255, 0.05);
}

.lore-popup-close {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 1.3em;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
}

.lore-popup-close:hover {
    color: #fff;
}

.lore-popup-body {
    word-wrap: break-word;
}

.lore-popup-error {
    color: #ff8888;
    font-style: italic;
}
</style>
