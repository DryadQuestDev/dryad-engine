import { ref, Ref, type Component } from 'vue';
import type { Placement } from '@floating-ui/vue';

export type PopupMode = 'transient' | 'pinned';

export interface PopupEntry {
    /** Stable id for dedup. Convention: `kind:id` or component-specific. */
    key: string;
    mode: PopupMode;
    anchorEl: HTMLElement;
    component: Component;
    props: Record<string, any>;
    /** Whether PopupItem renders a close button overlay. Default false. */
    closable?: boolean;
    placement?: Placement;
    width?: number | string;
    /**
     * DOM-derived depth for z-index. Transient popups opened nested inside another
     * popup get a non-zero value here so they render above their parent — even when
     * the parent is in the `pinned` list (which doesn't contribute to array indexes).
     * Falls back to the v-for index in PopupHost when undefined.
     */
    displayDepth?: number;
}

// Transient stack: hover/click-sticky-within-stack, depth-nested via DOM ancestor.
const stack: Ref<PopupEntry[]> = ref([]);
// Pinned list: explicitly opened, persists until explicit close or click-outside.
const pinned: Ref<PopupEntry[]> = ref([]);
const sticky: Ref<boolean> = ref(false);
const hoveredLinkDepths = new Set<number>();
const hoveredPopupDepths = new Set<number>();
let closeTimer: ReturnType<typeof setTimeout> | null = null;

export function getStack(): Ref<PopupEntry[]> {
    return stack;
}

export function getPinned(): Ref<PopupEntry[]> {
    return pinned;
}

export function isStickyRef(): Ref<boolean> {
    return sticky;
}

/** Returns true if any open transient popup is anchored inside the given element. */
export function popupAnchorIsInside(el: HTMLElement | null): boolean {
    if (!el) return false;
    return stack.value.some(e => el.contains(e.anchorEl));
}

function getLinkDepth(link: HTMLElement): number {
    const popup = link.closest('.popup') as HTMLElement | null;
    if (!popup) return 0;
    const d = parseInt(popup.dataset.depth || '0', 10);
    return d + 1;
}

function cancelClose(): void {
    if (closeTimer !== null) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }
}

function pruneStack(): void {
    let aliveDepth = -1;
    for (const d of hoveredLinkDepths) if (d > aliveDepth) aliveDepth = d;
    for (const d of hoveredPopupDepths) if (d > aliveDepth) aliveDepth = d;
    stack.value = stack.value.slice(0, aliveDepth + 1);
}

function scheduleClose(): void {
    if (sticky.value) return;
    cancelClose();
    closeTimer = setTimeout(() => {
        closeTimer = null;
        pruneStack();
    }, 100);
}

/** Push a transient popup (hover-driven). Idempotent on (key + anchor). */
export function pushTransient(entry: Omit<PopupEntry, 'mode'>): void {
    cancelClose();
    const linkDepth = getLinkDepth(entry.anchorEl);
    hoveredLinkDepths.add(linkDepth);
    if (sticky.value) return;
    // If the same popup is already pinned, don't duplicate it as a transient on hover.
    if (isPinned(entry.key)) return;
    const existing = stack.value[linkDepth];
    if (existing && existing.key === entry.key && existing.anchorEl === entry.anchorEl) return;
    stack.value = [...stack.value.slice(0, linkDepth), { ...entry, mode: 'transient', displayDepth: linkDepth }];
}

/** Hide a transient popup anchored to the given element (scheduled close). */
export function hideTransient(anchorEl: HTMLElement): void {
    const linkDepth = getLinkDepth(anchorEl);
    hoveredLinkDepths.delete(linkDepth);
    scheduleClose();
}

/** Click on a link — push transient and lock the stack until user dismisses. */
export function clickTransient(entry: Omit<PopupEntry, 'mode'>): void {
    cancelClose();
    if (isPinned(entry.key)) return;
    sticky.value = true;
    const linkDepth = getLinkDepth(entry.anchorEl);
    const existing = stack.value[linkDepth];
    if (existing && existing.key === entry.key && existing.anchorEl === entry.anchorEl) return;
    stack.value = [...stack.value.slice(0, linkDepth), { ...entry, mode: 'transient', displayDepth: linkDepth }];
}

export function notifyPopupEnter(depth: number): void {
    cancelClose();
    hoveredPopupDepths.add(depth);
}

export function notifyPopupLeave(depth: number): void {
    hoveredPopupDepths.delete(depth);
    scheduleClose();
}

export function makeSticky(): void {
    cancelClose();
    sticky.value = true;
}

export function popTop(): void {
    if (stack.value.length === 0) return;
    stack.value = stack.value.slice(0, -1);
    sticky.value = false;
}

/** Close the popup at the given depth and every popup stacked above it. depth=0 closes everything in the transient stack. */
export function closeFromDepth(depth: number): void {
    cancelClose();
    if (depth <= 0) {
        closeAll();
        return;
    }
    stack.value = stack.value.slice(0, depth);
    for (const d of [...hoveredPopupDepths]) if (d >= depth) hoveredPopupDepths.delete(d);
    for (const d of [...hoveredLinkDepths]) if (d > depth) hoveredLinkDepths.delete(d);
    sticky.value = false;
}

export function closeAll(): void {
    cancelClose();
    hoveredLinkDepths.clear();
    hoveredPopupDepths.clear();
    stack.value = [];
    sticky.value = false;
}

// ── Pinned popups ──

function findPinnedIndex(key: string): number {
    return pinned.value.findIndex(e => e.key === key);
}

export function isPinned(key: string): boolean {
    return findPinnedIndex(key) !== -1;
}

/** Add or update a pinned popup. Idempotent on `key`. */
export function pinPopup(entry: Omit<PopupEntry, 'mode'>): void {
    const full: PopupEntry = { ...entry, mode: 'pinned' };
    const idx = findPinnedIndex(full.key);
    if (idx === -1) {
        pinned.value = [...pinned.value, full];
    } else {
        const next = [...pinned.value];
        next[idx] = full;
        pinned.value = next;
    }
}

export function unpinPopup(key: string): void {
    const idx = findPinnedIndex(key);
    if (idx === -1) return;
    pinned.value = pinned.value.filter((_, i) => i !== idx);
}

export function togglePin(entry: Omit<PopupEntry, 'mode'>): void {
    if (isPinned(entry.key)) unpinPopup(entry.key);
    else pinPopup(entry);
}

export function closeAllPinned(): void {
    pinned.value = [];
}

/** Remove every popup (pinned or transient) whose key starts with the given prefix (or close all if no prefix). */
export function closePopupsByKey(prefix?: string): void {
    if (prefix === undefined) {
        closeAllPinned();
        closeAll();
        return;
    }
    pinned.value = pinned.value.filter(e => !e.key.startsWith(prefix));
    if (stack.value.some(e => e.key.startsWith(prefix))) {
        stack.value = stack.value.filter(e => !e.key.startsWith(prefix));
        // If we removed everything, release sticky so future hovers can open new popups.
        if (stack.value.length === 0) sticky.value = false;
    }
}

// ── Card kind registry (for v-script delegation) ──
// scriptDirective reads data-lore-id + data-lore-kind from `.lore-link` spans
// and looks up the matching factory here to build a popup entry. Naming kept as
// "lore-kind" because these specifically map inline-text [[X]] / [v:status] markers
// to a card; the popup chrome itself is generic.

export interface LoreKindFactory {
    component: Component;
    /** Build the props the card needs from the link id and any v-script context. */
    mapProps: (id: string, scriptContext?: Record<string, any>) => Record<string, any>;
    closable?: boolean;
}

const loreKindCards = new Map<string, LoreKindFactory>();

export function registerLoreKindCard(kind: string, factory: LoreKindFactory): void {
    loreKindCards.set(kind, factory);
}

export function resolveLoreKindCard(kind: string): LoreKindFactory | undefined {
    return loreKindCards.get(kind);
}
