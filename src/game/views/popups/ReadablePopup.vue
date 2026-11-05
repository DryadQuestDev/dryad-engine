<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import { getGameLineOrEngine } from '../../systems/itemSystem';

// Reader for Book and Scroll readables (itemSystem.readItem). The item comes from the reading_item
// state – the popup slot passes no props. A Book sets its text in page-wide CSS columns, so the
// browser lays out the pages; this counts them and slides the strip a spread at a time. A Scroll is
// one parchment the text scrolls on. Art, type and margins come from --readable-* CSS variables a
// game overrides on `.readable` (or `.readable[data-item="…"]` for one item).
const game = Game.getInstance();

/** Below this text width a Book shows one page instead of two side by side. */
const SPREAD_MIN_WIDTH = 560;
/** Gap between the two pages of a spread, in percent of the text width, unless --readable-spine-gap sets it. */
const DEFAULT_SPINE_GAP = 14;
/** Gap between single pages; never seen, it only separates the hidden next page. */
const SINGLE_PAGE_GAP = 48;
/** Horizontal travel, in px, that counts as a swipe. */
const SWIPE_DISTANCE = 40;

type ReadingItem = { id: string; uid?: string };

const reading = computed(() => game.getState('reading_item') as ReadingItem | null);
const item = computed(() => {
    const open = reading.value;
    if (!open) return null;
    const held = game.itemSystem.readingItem.value;
    if (held && held.id === open.id && (held.uid || '') === (open.uid || '')) return held;
    return open.uid ? game.itemSystem.getItemByUid(open.uid) || null : null;
});
const template = computed(() => reading.value ? game.itemSystem.itemTemplatesMap.get(reading.value.id) : undefined);
const readable = computed(() => item.value
    ? item.value.getReadable()
    : reading.value ? game.itemSystem.getTemplateReadable(reading.value.id) : null);
const type = computed(() => readable.value?.type === 'scroll' ? 'scroll' : 'book');

// Template first, like the readable itself: an item made from an inline object has only its own.
const traitOf = (key: string): string => (template.value?.traits as any)?.[key] || (item.value?.traits as any)?.[key] || '';
const title = computed(() => traitOf('name') || reading.value?.id || '');
const icon = computed(() => traitOf('image'));

// The parser stores a blank line in a template as <br><br>; each run of two or more breaks
// starts a paragraph, while a single <br> stays a line break (poems).
const paragraphs = computed(() => {
    const text = readable.value ? game.itemSystem.getReadableText(readable.value) : null;
    return (text || '').split(/(?:<br\s*\/?>\s*){2,}/i).map(p => p.trim()).filter(Boolean);
});

const root = ref<HTMLElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const flow = ref<HTMLElement | null>(null);

const spread = ref(1);
const total = ref(1);
const at = ref(0);
let step = 1;
// The paragraph holding the current page's first line. Taken when a page is shown, never at
// relayout: by the time a ResizeObserver fires, the text has already reflowed to the new width.
let place: Element | null = null;

const canBack = computed(() => at.value > 0);
const canNext = computed(() => at.value + spread.value < total.value);
const pageLabel = computed(() => {
    const last = Math.min(total.value, at.value + spread.value);
    return last > at.value + 1
        ? getGameLineOrEngine('readable.pages', { from: at.value + 1, to: last, total: total.value })
        : getGameLineOrEngine('readable.page', { n: at.value + 1, total: total.value });
});
const closeLabel = computed(() => getGameLineOrEngine('readable.close'));
const backLabel = computed(() => getGameLineOrEngine('readable.back'));
const nextLabel = computed(() => getGameLineOrEngine('readable.next'));

function rel(el: Element): { x: number; y: number } {
    const rect = el.getClientRects()[0];
    const origin = flow.value!.getBoundingClientRect();
    return rect ? { x: rect.left - origin.left, y: rect.top - origin.top } : { x: 0, y: 0 };
}

function pageOf(el: Element): number {
    return Math.floor((rel(el).x + 1) / step);
}

// The last paragraph that starts on an earlier page, or at the very top of this one.
function anchor(): Element | null {
    let found: Element | null = null;
    for (const para of Array.from(flow.value?.children || [])) {
        const page = pageOf(para);
        if (page < at.value || (page === at.value && rel(para).y < 2)) found = para;
        else break;
    }
    return found;
}

function layout() {
    const box = viewport.value?.getBoundingClientRect();
    const text = flow.value;
    if (!box || !text) return;
    if (type.value !== 'book') {
        text.removeAttribute('style');
        return;
    }
    if (!box.width || !box.height) return;
    // Fractional sizes and a column COUNT: a column width taken from a rounded size can miss
    // fitting twice by a fraction of a pixel, and the browser then falls back to one wide column.
    spread.value = box.width >= SPREAD_MIN_WIDTH ? 2 : 1;
    const spineGap = parseFloat(getComputedStyle(text).getPropertyValue('--readable-spine-gap'));
    const gap = spread.value === 2 ? Math.round(box.width * (isNaN(spineGap) ? DEFAULT_SPINE_GAP : spineGap) / 100) : SINGLE_PAGE_GAP;
    step = (box.width - gap * (spread.value - 1)) / spread.value + gap;
    Object.assign(text.style, { height: Math.floor(box.height) + 'px', columnCount: String(spread.value), columnGap: gap + 'px' });

    const end = text.querySelector('.readable-end');
    total.value = end ? pageOf(end) + 1 : 1;
    let page = place && text.contains(place) ? pageOf(place) : 0;
    page = Math.min(page, total.value - 1);
    at.value = page - page % spread.value;
    show(true);
}

// Turns are instant: sliding the column strip carried the text across the spine and the page edges.
function show(keepPlace = false) {
    const text = flow.value;
    if (!text) return;
    text.style.transform = `translateX(${-at.value * step}px)`;
    // A relayout keeps the remembered paragraph, so repeated resizes never drift backwards.
    if (!keepPlace || !place) place = anchor();
}

function turn(direction: number) {
    if (type.value !== 'book') return;
    const next = at.value + direction * spread.value;
    if (next < 0 || next >= total.value) return;
    at.value = next;
    show();
}

function close() {
    game.closePopup('readable_popup');
    game.setState('reading_item', null);
    game.itemSystem.readingItem.value = null;
}

function onKey(event: KeyboardEvent) {
    // Marked handled so the game does not also open its menu on this Escape.
    if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
    }
    if (type.value !== 'book') return;
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        turn(1);
    } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        turn(-1);
    }
}

let swipeStart: number | null = null;
function onPointerDown(event: PointerEvent) {
    swipeStart = event.pointerType === 'mouse' ? null : event.clientX;
}
function onPointerUp(event: PointerEvent) {
    if (swipeStart === null) return;
    const distance = event.clientX - swipeStart;
    swipeStart = null;
    if (Math.abs(distance) > SWIPE_DISTANCE) turn(distance < 0 ? 1 : -1);
}

let frame = 0;
const relayout = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
};
let observer: ResizeObserver | null = null;

// A new text size reflows the pages without resizing anything, so the ResizeObserver never sees it.
watch(() => Global.getInstance().userSettings.value.font_size, () => nextTick(relayout));

watch([paragraphs, type], async () => {
    at.value = 0;
    if (viewport.value) viewport.value.scrollTop = 0;
    await nextTick();
    place = flow.value?.firstElementChild || null;
    layout();
});

onMounted(() => {
    place = flow.value?.firstElementChild || null;
    layout();
    observer = new ResizeObserver(relayout);
    if (viewport.value) observer.observe(viewport.value);
    document.fonts?.ready.then(relayout);
    flow.value?.addEventListener('load', relayout, true);
    document.addEventListener('keydown', onKey);
    root.value?.focus({ preventScroll: true });
});

onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    flow.value?.removeEventListener('load', relayout, true);
    document.removeEventListener('keydown', onKey);
});
</script>

<template>
    <div ref="root" class="readable" :class="['readable--' + type, { 'readable--spread': type === 'book' && spread === 2 }]"
        v-bind="{ 'data-item': reading?.id }" role="dialog" :aria-label="title" tabindex="-1">
        <div class="readable-header">
            <img v-if="icon" :src="icon" alt="" class="readable-icon" />
            <span class="readable-title">{{ title }}</span>
            <button type="button" class="readable-close" :aria-label="closeLabel" :title="closeLabel" @click="close">✕</button>
        </div>
        <div class="readable-body">
            <button v-if="type === 'book'" type="button" class="readable-arrow" :disabled="!canBack"
                :aria-label="backLabel" @click="turn(-1)">‹</button>
            <div class="readable-paper" @pointerdown="onPointerDown" @pointerup="onPointerUp">
                <div ref="viewport" class="readable-viewport">
                    <div ref="flow" class="readable-text">
                        <p v-for="(para, i) in paragraphs" :key="i">
                            <span v-html="para"></span><span v-if="i === paragraphs.length - 1" class="readable-end"></span>
                        </p>
                    </div>
                </div>
            </div>
            <button v-if="type === 'book'" type="button" class="readable-arrow" :disabled="!canNext"
                :aria-label="nextLabel" @click="turn(1)">›</button>
        </div>
        <div v-if="type === 'book'" class="readable-footer">{{ pageLabel }}</div>
    </div>
</template>

<style scoped>
/* Every setting is a --readable-* variable read with a fallback and never set here, so a game's
   plain `.readable { --readable-ink: … }` wins without fighting this file's scoped specificity.
   The art is not a variable: see the unscoped block at the end. */
.readable {
    box-sizing: border-box;
    width: min(1100px, 90vw);
    width: min(1100px, 90dvw);
    height: min(760px, 86vh);
    height: min(760px, 86dvh);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px 10px;
    /* No panel by default: the book or scroll stands on the popup's dimmed mask. */
    background: var(--readable-frame, transparent);
    border-radius: 12px;
    outline: none;
    /* With no panel, the title, arrows and page count stand on whatever the mask dims. */
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.6);
}

/* The page text sits on the art and takes no shadow. */
.readable-text {
    text-shadow: none;
}

.readable-header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
}

.readable-icon {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex: none;
}

.readable-title {
    flex: 1;
    min-width: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--readable-title-color, #e4dbc8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.readable-close {
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    color: #b0a695;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
}

.readable-close:hover {
    color: #e4dbc8;
}

.readable-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
    gap: 6px;
}

.readable-arrow {
    flex: none;
    width: 34px;
    padding: 0;
    border: none;
    background: none;
    color: var(--readable-accent, #d9b77a);
    font-size: 34px;
    line-height: 1;
    cursor: pointer;
}

.readable-arrow:disabled {
    opacity: 0.2;
    cursor: default;
}

.readable-paper {
    position: relative;
    flex: 1;
    min-width: 0;
    border-radius: 4px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55);
    /* Vertical panning stays with the browser; a horizontal drag is a page swipe. */
    touch-action: pan-y;
}

.readable-viewport {
    position: absolute;
    inset: var(--readable-page-inset, 7% 6%);
    overflow: hidden;
}

.readable-text {
    position: relative;
    height: 100%;
    column-fill: auto;
    color: var(--readable-ink, #3b2a18);
    font-family: var(--readable-font, Georgia, 'Times New Roman', serif);
    /* 1em: the player's text size setting, which .game-body applies to everything under it. */
    font-size: var(--readable-font-size, 1em);
    font-style: var(--readable-font-style, normal);
    line-height: var(--readable-line-height, 1.55);
}

.readable-text p {
    margin: 0 0 0.75em;
    orphans: 2;
    widows: 2;
    text-align: var(--readable-text-align, justify);
    hyphens: auto;
}

.readable-text :deep(img) {
    max-width: 100%;
    break-inside: avoid;
}

.readable-footer {
    min-height: 20px;
    text-align: center;
    color: var(--readable-accent, #d9b77a);
    font-size: 14px;
    font-style: italic;
}

/* Scroll: as tall as its text, up to the frame's limit, then the text scrolls on the parchment. */
.readable--scroll {
    width: min(680px, 90vw);
    width: min(680px, 90dvw);
    height: auto;
    max-height: min(760px, 86vh);
    max-height: min(760px, 86dvh);
}

.readable--scroll .readable-body {
    flex: 0 1 auto;
}

.readable--scroll .readable-paper {
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin: calc(var(--readable-roller-height, 24px) / 2 + 4px) calc(var(--readable-roller-overhang, 16px) + 2px);
    padding: var(--readable-scroll-inset, 22px 8%);
    border-radius: 0;
}

.readable--scroll .readable-paper::before,
.readable--scroll .readable-paper::after {
    content: '';
    position: absolute;
    left: calc(var(--readable-roller-overhang, 16px) * -1);
    right: calc(var(--readable-roller-overhang, 16px) * -1);
    height: var(--readable-roller-height, 24px);
    border-radius: var(--readable-roller-radius, 12px);
    z-index: 1;
}

.readable--scroll .readable-paper::before {
    top: calc(var(--readable-roller-height, 24px) / -2);
}

.readable--scroll .readable-paper::after {
    bottom: calc(var(--readable-roller-height, 24px) / -2);
}

.readable--scroll .readable-viewport {
    position: relative;
    inset: auto;
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #b89a5a transparent;
}

.readable--scroll .readable-text {
    height: auto;
    padding-bottom: 4px;
}

.readable--scroll .readable-text p {
    text-align: var(--readable-text-align, left);
}

/* A phone page is too narrow to justify without wide gaps between words, and every pixel the
   arrows give up goes to the text. */
@media (max-width: 520px) {
    .readable {
        padding: 10px 8px 8px;
    }

    .readable-body {
        gap: 2px;
    }

    .readable-arrow {
        width: 22px;
        font-size: 28px;
    }

    .readable-text p {
        text-align: var(--readable-text-align, left);
    }
}
</style>

<style>
/* The drawn default art, at zero specificity, so a game replaces any piece with a plain selector in its own
   CSS, whatever order the files load in: `.readable--spread .readable-paper { background: url('assets/games_assets/…') … }`.
   Not variables: in a build this component's CSS is a separate file, and a url() inside a variable resolves
   against the stylesheet that uses it, so a game's document-relative path would point into the engine's folder. */
:where(.readable-paper) {
    background: linear-gradient(90deg, #d9c08c 0, #efe0bd 4%, #efe0bd 96%, #e3cf9f 100%);
}

:where(.readable--spread .readable-paper) {
    background: linear-gradient(90deg, #d9c08c 0, #efe0bd 3%, #efe0bd 45%, #d6bf8c 49.2%, #a88c55 50%, #d6bf8c 50.8%, #efe0bd 55%, #efe0bd 97%, #d9c08c 100%);
}

:where(.readable--scroll .readable-paper) {
    background: linear-gradient(90deg, #d9c08c, #efe0bd 6%, #efe0bd 94%, #d9c08c);
}

:where(.readable--scroll .readable-paper)::before,
:where(.readable--scroll .readable-paper)::after {
    background: linear-gradient(180deg, #8a5a2b, #c48a4a 35%, #6b4020 80%, #4a2a12);
}
</style>
