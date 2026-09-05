import { markRaw, type Component, type Directive, type DirectiveBinding } from 'vue';
import type { Placement } from '@floating-ui/vue';
import {
    pushTransient,
    hideTransient,
    togglePin,
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
        el.addEventListener('pointerenter', onEnter);
        el.addEventListener('pointerleave', onLeave);
        el.addEventListener('click', onClick);
        (el as any)[HANDLERS] = { onEnter, onLeave, onClick };
    },
    updated(el, binding: DirectiveBinding<PopoverBinding>) {
        (el as any)[OPTS] = normalize(binding.value, binding.modifiers);
    },
    unmounted(el) {
        const h = (el as any)[HANDLERS] as { onEnter: any; onLeave: any; onClick: any } | undefined;
        if (h) {
            el.removeEventListener('pointerenter', h.onEnter);
            el.removeEventListener('pointerleave', h.onLeave);
            el.removeEventListener('click', h.onClick);
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
