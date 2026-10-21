import { markRaw, type Component, type Directive, type DirectiveBinding } from 'vue';
import type { Placement } from '@floating-ui/vue';
import {
    pushTransient,
    hideTransient,
    togglePin,
    pinPopup,
    closePopupsByKey,
} from '../views/popups/popupStore';
import HtmlPopupBody from '../views/popups/cards/HtmlPopupBody.vue';

export type PopoverBinding =
    | string
    | null
    | undefined
    | {
        html?: string;
        component?: Component;
        props?: Record<string, unknown>;
        context?: Record<string, any>;
        /**
         * Force the card to catch the pointer while it is a hover card — scroll it, follow its
         * lore links, press its buttons. WCAG 1.4.13 calls this "hoverable". Omitted, the card
         * follows the player's `interactive_tooltips` setting, which defaults to peek: the card
         * is pointer-transparent, so it never blocks the slots it overlaps and dies with the
         * anchor hover. Set this only where the card can never be pinned instead — an anchor
         * whose click is spent on something else (rpg_battler's ability rows use `dismissOnClick`
         * to fire the ability) would otherwise leave a long card unreachable.
         */
        interactive?: boolean;
        /** When true, clicking the anchor closes the popup immediately instead of pinning it. For action triggers like ability buttons. */
        dismissOnClick?: boolean;
        /** When true, clicking the anchor does nothing to the popup — no pin, no dismiss; the card stays hover-only. Use when the anchor's click is handled for another purpose (e.g. a selection toggle). */
        disableClick?: boolean;
        closable?: boolean;
        width?: number | string;
        placement?: Placement;
        /** Custom popup-store key. Defaults to an auto-generated per-element key. */
        key?: string;
    };

type Normalized = {
    component: Component;
    props: Record<string, unknown>;
    interactive: boolean;
    dismissOnClick: boolean;
    disableClick: boolean;
    closable: boolean;
    width: number | string | undefined;
    placement: Placement | undefined;
    key: string | undefined;
} | null;

const PLACEMENT_MODS: Placement[] = ['top', 'bottom', 'left', 'right'];
const KEY = Symbol('de-popover-key');
const OPTS = Symbol('de-popover-opts');
const HANDLERS = Symbol('de-popover-handlers');

// Touch has no hover, so an anchor whose tap is spent on something else (`disableClick` /
// `dismissOnClick`: an ability row casts, a recipe button selects) had no way to show its card.
// On those, a long press pins it. Draggable anchors are left alone: a hold there starts a drag.
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

function longPressEligible(el: HTMLElement, opts: Normalized): boolean {
    return !!opts && (opts.disableClick || opts.dismissOnClick) && !el.draggable;
}

// No callout menu or text selection on a held anchor (iOS shows both on a long press).
function syncTouchStyle(el: HTMLElement, opts: Normalized) {
    const off = longPressEligible(el, opts);
    el.style.setProperty('-webkit-touch-callout', off ? 'none' : '');
    el.style.setProperty('-webkit-user-select', off ? 'none' : '');
    el.style.userSelect = off ? 'none' : '';
}

let nextKey = 0;
function getKey(el: HTMLElement): string {
    let k = (el as any)[KEY] as string | undefined;
    if (!k) { k = `popover:${++nextKey}`; (el as any)[KEY] = k; }
    return k;
}

function normalize(value: PopoverBinding, modifiers: Record<string, boolean>): Normalized {
    if (value == null || value === '') return null;
    const placementMod = PLACEMENT_MODS.find((p) => modifiers[p]);

    if (typeof value === 'string') {
        return {
            component: markRaw(HtmlPopupBody),
            props: { html: value },
            interactive: false,
            dismissOnClick: false,
            disableClick: false,
            closable: false,
            width: undefined,
            placement: placementMod,
            key: undefined,
        };
    }
    if (value.component) {
        return {
            component: markRaw(value.component),
            props: value.props ?? {},
            interactive: value.interactive === true,
            dismissOnClick: value.dismissOnClick === true,
            disableClick: value.disableClick === true,
            closable: value.closable === true,
            width: value.width,
            placement: value.placement ?? placementMod,
            key: value.key,
        };
    }
    if (value.html != null) {
        return {
            component: markRaw(HtmlPopupBody),
            props: { html: value.html, context: value.context },
            interactive: value.interactive === true,
            dismissOnClick: value.dismissOnClick === true,
            disableClick: value.disableClick === true,
            closable: value.closable === true,
            width: value.width,
            placement: value.placement ?? placementMod,
            key: value.key,
        };
    }
    return null;
}

function buildEntry(el: HTMLElement, opts: Normalized) {
    if (!opts) return null;
    return {
        key: opts.key ?? getKey(el),
        anchorEl: el,
        component: opts.component,
        props: opts.props,
        closable: opts.closable,
        interactive: opts.interactive,
        placement: opts.placement,
        width: opts.width,
    };
}

export const popover: Directive<HTMLElement, PopoverBinding> = {
    mounted(el, binding) {
        const opts = normalize(binding.value, binding.modifiers);
        (el as any)[OPTS] = opts;

        // Mouse only. A tap synthesizes mouseenter before click, so a touch device would open a
        // hover card that never receives the matching leave — it would sit behind the pinned copy
        // for the rest of the session. Filtering on pointerType also covers hybrid laptops, which
        // a `(pointer: fine)` media query would report as mouse-only.
        const onEnter = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            const cur = (el as any)[OPTS] as Normalized;
            const entry = buildEntry(el, cur);
            if (entry) pushTransient(entry);
        };
        const onLeave = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            hideTransient(el);
        };
        const onClick = () => {
            const cur = (el as any)[OPTS] as Normalized;
            const entry = buildEntry(el, cur);
            if (!entry) return;
            if (cur!.disableClick) return;
            if (cur!.dismissOnClick) { closePopupsByKey(entry.key); return; }
            togglePin(entry);
        };

        // Long press (touch/pen only). A finger that moves, or a scroll the browser takes over
        // (pointercancel), drops the press. Android's own long-press fires `contextmenu`, which
        // counts as the press too, whichever comes first.
        let pressTimer: ReturnType<typeof setTimeout> | null = null;
        let pressX = 0, pressY = 0;
        let pressFired = false;
        const clearPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
        const firePress = () => {
            clearPress();
            const entry = buildEntry(el, (el as any)[OPTS] as Normalized);
            if (!entry) return;
            pressFired = true;
            pinPopup(entry);
        };
        const onDown = (e: PointerEvent) => {
            pressFired = false;
            if (e.pointerType === 'mouse' || !longPressEligible(el, (el as any)[OPTS])) return;
            pressX = e.clientX; pressY = e.clientY;
            clearPress();
            pressTimer = setTimeout(firePress, LONG_PRESS_MS);
        };
        const onMove = (e: PointerEvent) => {
            if (pressTimer && Math.hypot(e.clientX - pressX, e.clientY - pressY) > LONG_PRESS_SLOP) clearPress();
        };
        const onContextMenu = (e: Event) => {
            if (pressTimer) firePress();
            if (pressFired) e.preventDefault();
        };
        // The tap that ends a long press must not also do the anchor's own action (cast the
        // ability, select the recipe) or unpin the card it just opened. Capture, so it runs before
        // the anchor's handlers on itself and its children.
        const onClickCapture = (e: MouseEvent) => {
            if (!pressFired) return;
            pressFired = false;
            e.stopImmediatePropagation();
            e.preventDefault();
        };

        el.addEventListener('pointerenter', onEnter);
        el.addEventListener('pointerleave', onLeave);
        el.addEventListener('click', onClick);
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', clearPress);
        el.addEventListener('pointercancel', clearPress);
        el.addEventListener('contextmenu', onContextMenu);
        el.addEventListener('click', onClickCapture, true);
        syncTouchStyle(el, opts);
        (el as any)[HANDLERS] = { onEnter, onLeave, onClick, onDown, onMove, clearPress, onContextMenu, onClickCapture };
    },
    updated(el, binding: DirectiveBinding<PopoverBinding>) {
        const opts = normalize(binding.value, binding.modifiers);
        (el as any)[OPTS] = opts;
        syncTouchStyle(el, opts);
    },
    unmounted(el) {
        const h = (el as any)[HANDLERS] as Record<string, any> | undefined;
        if (h) {
            el.removeEventListener('pointerenter', h.onEnter);
            el.removeEventListener('pointerleave', h.onLeave);
            el.removeEventListener('click', h.onClick);
            el.removeEventListener('pointerdown', h.onDown);
            el.removeEventListener('pointermove', h.onMove);
            el.removeEventListener('pointerup', h.clearPress);
            el.removeEventListener('pointercancel', h.clearPress);
            el.removeEventListener('contextmenu', h.onContextMenu);
            el.removeEventListener('click', h.onClickCapture, true);
            h.clearPress();
            delete (el as any)[HANDLERS];
        }
        const opts = (el as any)[OPTS] as Normalized;
        const autoKey = (el as any)[KEY] as string | undefined;
        const customKey = opts?.key;
        if (customKey) closePopupsByKey(customKey);
        if (autoKey) closePopupsByKey(autoKey);
        delete (el as any)[OPTS];
        delete (el as any)[KEY];
    },
};
