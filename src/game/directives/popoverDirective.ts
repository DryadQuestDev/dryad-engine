import { markRaw, type Component, type Directive, type DirectiveBinding } from 'vue';
import type { Placement } from '@floating-ui/vue';
import {
    pushTransient,
    hideTransient,
    togglePin,
    clickTransient,
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
        sticky?: boolean;
        /** When true, clicking the anchor closes the popup immediately instead of pinning it. For action triggers like ability buttons. */
        dismissOnClick?: boolean;
        closable?: boolean;
        width?: number | string;
        placement?: Placement;
        /** Custom popup-store key. Defaults to an auto-generated per-element key. */
        key?: string;
    };

type Normalized = {
    component: Component;
    props: Record<string, unknown>;
    sticky: boolean;
    dismissOnClick: boolean;
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
            sticky: false,
            dismissOnClick: false,
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
            sticky: value.sticky === true,
            dismissOnClick: value.dismissOnClick === true,
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
            sticky: value.sticky === true,
            dismissOnClick: value.dismissOnClick === true,
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
        placement: opts.placement,
        width: opts.width,
    };
}

export const popover: Directive<HTMLElement, PopoverBinding> = {
    mounted(el, binding) {
        const opts = normalize(binding.value, binding.modifiers);
        (el as any)[OPTS] = opts;

        const onEnter = () => {
            const cur = (el as any)[OPTS] as Normalized;
            const entry = buildEntry(el, cur);
            if (entry) pushTransient(entry);
        };
        const onLeave = () => {
            hideTransient(el);
        };
        const onClick = () => {
            const cur = (el as any)[OPTS] as Normalized;
            const entry = buildEntry(el, cur);
            if (!entry) return;
            if (cur!.dismissOnClick) { closePopupsByKey(entry.key); return; }
            if (cur!.sticky) togglePin(entry);
            else clickTransient(entry);
        };
        el.addEventListener('mouseenter', onEnter);
        el.addEventListener('mouseleave', onLeave);
        el.addEventListener('click', onClick);
        (el as any)[HANDLERS] = { onEnter, onLeave, onClick };
    },
    updated(el, binding: DirectiveBinding<PopoverBinding>) {
        (el as any)[OPTS] = normalize(binding.value, binding.modifiers);
    },
    unmounted(el) {
        const h = (el as any)[HANDLERS] as { onEnter: any; onLeave: any; onClick: any } | undefined;
        if (h) {
            el.removeEventListener('mouseenter', h.onEnter);
            el.removeEventListener('mouseleave', h.onLeave);
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
