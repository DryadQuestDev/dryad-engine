import { ref, Ref } from 'vue';

export interface PopupEntry {
    recordId: string;
    anchorEl: HTMLElement;
}

const stack: Ref<PopupEntry[]> = ref([]);
const sticky: Ref<boolean> = ref(false);
const hoveredLinkDepths = new Set<number>();
const hoveredPopupDepths = new Set<number>();
let closeTimer: ReturnType<typeof setTimeout> | null = null;

export function getStack(): Ref<PopupEntry[]> {
    return stack;
}

export function isSticky(): Ref<boolean> {
    return sticky;
}

/** Returns true if any open lore popup is anchored to a link inside the given element. */
export function loreAnchorIsInside(el: HTMLElement | null): boolean {
    if (!el) return false;
    return stack.value.some(e => el.contains(e.anchorEl));
}

function getLinkDepth(link: HTMLElement): number {
    // Popups are teleported to <body> as siblings (not nested), so we can't count
    // .lore-popup ancestors to find stack depth. Read the closest popup's data-depth
    // (set by LorePopupItem from its v-for index) and return that + 1. Links in base
    // text have no .lore-popup ancestor → depth 0.
    const popup = link.closest('.lore-popup') as HTMLElement | null;
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
    }, 150);
}

export function notifyLinkEnter(anchorEl: HTMLElement, recordId: string): void {
    cancelClose();
    const linkDepth = getLinkDepth(anchorEl);
    hoveredLinkDepths.add(linkDepth);
    if (sticky.value) return;
    const existing = stack.value[linkDepth];
    if (existing && existing.recordId === recordId && existing.anchorEl === anchorEl) return;
    stack.value = [...stack.value.slice(0, linkDepth), { recordId, anchorEl }];
}

export function notifyLinkLeave(anchorEl: HTMLElement): void {
    const linkDepth = getLinkDepth(anchorEl);
    hoveredLinkDepths.delete(linkDepth);
    scheduleClose();
}

export function notifyPopupEnter(depth: number): void {
    cancelClose();
    hoveredPopupDepths.add(depth);
}

export function notifyPopupLeave(depth: number): void {
    hoveredPopupDepths.delete(depth);
    scheduleClose();
}

export function pushClick(recordId: string, anchorEl: HTMLElement): void {
    cancelClose();
    sticky.value = true;
    const linkDepth = getLinkDepth(anchorEl);
    const existing = stack.value[linkDepth];
    if (existing && existing.recordId === recordId && existing.anchorEl === anchorEl) return;
    stack.value = [...stack.value.slice(0, linkDepth), { recordId, anchorEl }];
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

/** Close the popup at the given depth and every popup stacked above it. depth=0 closes everything. */
export function closeFromDepth(depth: number): void {
    cancelClose();
    if (depth <= 0) {
        closeAll();
        return;
    }
    stack.value = stack.value.slice(0, depth);
    // Drop any hover state for popups that are now gone.
    for (const d of [...hoveredPopupDepths]) if (d >= depth) hoveredPopupDepths.delete(d);
    for (const d of [...hoveredLinkDepths]) if (d > depth) hoveredLinkDepths.delete(d);
    // Always release sticky on user-initiated close so subsequent hovers can open new popups.
    sticky.value = false;
}

export function closeAll(): void {
    cancelClose();
    hoveredLinkDepths.clear();
    hoveredPopupDepths.clear();
    stack.value = [];
    sticky.value = false;
}
