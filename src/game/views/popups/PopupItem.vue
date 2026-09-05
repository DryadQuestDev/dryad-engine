<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useFloating, offset, flip, shift, size, autoUpdate } from '@floating-ui/vue';
import { Global } from '../../../global/global';
import { notifyPopupEnter, notifyPopupLeave, closeFromDepth, unpinPopup } from './popupStore';
import type { PopupEntry } from './popupStore';

const props = defineProps<{ entry: PopupEntry; depth: number }>();

const global = Global.getInstance();
const fontSize = computed(() => `${global.userSettings.value.font_size}px`);

// Peek by default: a hover card that catches the pointer blocks the slots it overlaps, which is
// what makes sweeping across an item grid awkward. A pinned card is always interactive — that is
// how the content stays reachable (WCAG 1.4.13 "hoverable") while hover is only a peek.
const isInteractive = computed(() =>
    props.entry.mode === 'pinned'
    || props.entry.interactive === true
    || global.userSettings.value.interactive_tooltips === true
);

const anchor = ref<HTMLElement | null>(props.entry.anchorEl);
const popupEl = ref<HTMLElement | null>(null);

watch(() => props.entry, (e) => { anchor.value = e.anchorEl; });

const placement = computed(() => props.entry.placement ?? 'bottom-start');

const { floatingStyles } = useFloating(anchor, popupEl, {
    placement,
    strategy: 'fixed',
    middleware: [
        offset(2),
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

function onClose() {
    if (props.entry.mode === 'pinned') unpinPopup(props.entry.key);
    else closeFromDepth(props.depth);
}

function onPopupEnter() {
    if (props.entry.mode === 'transient') notifyPopupEnter(props.depth);
}

function onPopupLeave() {
    if (props.entry.mode === 'transient') notifyPopupLeave(props.depth);
}

const cardProps = computed(() => ({ ...props.entry.props, onClose }));

const widthStyle = computed(() => {
    const w = props.entry.width;
    if (w === undefined) return undefined;
    return typeof w === 'number' ? `${w}px` : w;
});
</script>

<template>
    <div ref="popupEl" class="popup dark-scrollbar" :class="{ interactive: isInteractive }"
        v-bind="{ 'data-depth': entry.displayDepth ?? depth, 'data-popup-key': entry.key, 'data-closable': entry.closable ? '' : undefined }"
        :style="[floatingStyles, { zIndex: 10000 + (entry.displayDepth ?? depth), width: widthStyle }]"
        @mouseenter="onPopupEnter" @mouseleave="onPopupLeave">
        <button v-if="entry.closable" class="popup-close-overlay" @click="onClose" aria-label="Close">×</button>
        <component :is="entry.component" v-bind="cardProps" />
    </div>
</template>

<style scoped>
.popup {
    position: fixed;
    pointer-events: none;
    width: 360px;
    background: rgba(15, 15, 18, 0.97);
    border: 1px solid #444;
    border-radius: 6px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    color: #e8e8f0;
    font-size: v-bind(fontSize);
    line-height: 1.5;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.popup.interactive {
    pointer-events: auto;
}

.popup-close-overlay {
    position: absolute;
    top: 4px;
    right: 6px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 1.4em;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    z-index: 1;
}

.popup-close-overlay:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
}
</style>

<style>
/* Global styles shared by all card components */
.popup-inner {
    padding: 10px 14px 12px;
}

.popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.popup-title {
    font-weight: 600;
    color: #e8e8f0;
    letter-spacing: 0.3px;
}

.popup-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.popup-action {
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

.popup-action:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
}

.popup-body {
    word-wrap: break-word;
}

.popup-stack-count {
    margin-left: 0.5rem;
    font-weight: bold;
    color: #ffd700;
    font-size: 0.9em;
}

.popup-description {
    margin: 0 0 6px 0;
    color: #ccc;
}

.popup-error {
    color: #ff8888;
    font-style: italic;
}

/* Reset chrome on shared card components when rendered inside a popup.
   The popup shell already provides background + border + shadow; let cards
   keep their own chrome only when used standalone (encyclopedia, exchange).
   Padding is left to the card's own scoped style — ItemCard ships with
   12px which covers both the lore-link path and the ItemPopupCard path
   (whose .popup-inner wrapper drops its own padding to avoid stacking). */
.popup .item-card,
.popup .item-choices {
    background: transparent;
    border: none;
    box-shadow: none;
    width: auto;
    max-width: none;
}

/* The .popup-close-overlay button sits absolute at top:4px right:6px and is
   ~28px wide. The cost block in .item-card's header is right-anchored with
   margin-left: auto and lands directly under the X, so it needs clearance —
   but only on popups that actually render the button (data-closable). */
.popup[data-closable] .item-card .item-cost {
    margin-right: 28px;
}
</style>
