import type { Directive } from 'vue';
import { Game } from '../game';
import { notifyLinkEnter, notifyLinkLeave, pushClick } from '../views/lore/lorePopupStore';

/**
 * Directive `v-script` — render DryadScript text on any element with full lore-link interactivity.
 *
 * - Resolves the input through the engine's text pipeline by default (`resolver: true`).
 * - Attaches event delegation on the host element so `<span class="lore-link">` children
 *   produced by `[[id]]` syntax open lore popups on hover/click.
 * - One-time event listeners (mount/unmount); `updated` only re-renders innerHTML.
 *
 * The resolver always runs with `noExecuteActions: true` — rendering must never fire side
 * effects like `{discover_lore: ...}`. Sites that rely on action firing (scene encounters,
 * quest log entries) must call `game.resolveString(...)` explicitly upstream and pass the
 * result with `{ resolver: false }`.
 *
 * Usage:
 *   <div v-script="rawText" />                                            // resolve + render
 *   <div v-script="{ html, resolver: false }" />                          // already resolved upstream
 *   <div v-script="{ html, navMode: true, onNavigate: handler }" />       // encyclopedia
 *   <div v-script="{ html, disabled: typingAnim.isAnimating.value }" />   // suppress hover/click
 */
export type ScriptDirectiveValue = string | {
    html: string;
    resolver?: boolean;
    navMode?: boolean;
    onNavigate?: (recordId: string) => void;
    disabled?: boolean;
};

const OPTS = Symbol('de-script-opts');
const HANDLERS = Symbol('de-script-handlers');

type NormalizedOpts = {
    html: string;
    resolver: boolean;
    navMode: boolean;
    onNavigate?: (recordId: string) => void;
    disabled: boolean;
};

function normalize(value: ScriptDirectiveValue | undefined): NormalizedOpts {
    if (typeof value === 'string') {
        return { html: value, resolver: true, navMode: false, disabled: false };
    }
    return {
        html: value?.html ?? '',
        resolver: value?.resolver !== false,
        navMode: value?.navMode === true,
        onNavigate: value?.onNavigate,
        disabled: value?.disabled === true,
    };
}

function applyBinding(el: HTMLElement, value: ScriptDirectiveValue | undefined) {
    const opts = normalize(value);
    const html = opts.resolver ? Game.getInstance().resolveString(opts.html, true).output : opts.html;
    el.innerHTML = html;
    (el as any)[OPTS] = opts;
}

function findLink(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest('.lore-link') as HTMLElement | null;
}

function attachListeners(el: HTMLElement) {
    const onOver = (e: MouseEvent) => {
        const opts = (el as any)[OPTS] as NormalizedOpts | undefined;
        if (!opts || opts.disabled || opts.navMode) return;
        const link = findLink(e.target);
        if (!link) return;
        const id = link.getAttribute('data-lore-id');
        if (id) notifyLinkEnter(link, id);
    };
    const onOut = (e: MouseEvent) => {
        const opts = (el as any)[OPTS] as NormalizedOpts | undefined;
        if (!opts || opts.disabled || opts.navMode) return;
        const link = findLink(e.target);
        if (link) notifyLinkLeave(link);
    };
    const onClick = (e: MouseEvent) => {
        const opts = (el as any)[OPTS] as NormalizedOpts | undefined;
        if (!opts || opts.disabled) return;
        const link = findLink(e.target);
        if (!link) return;
        const id = link.getAttribute('data-lore-id');
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        if (opts.navMode) opts.onNavigate?.(id);
        else pushClick(id, link);
    };
    el.addEventListener('mouseover', onOver);
    el.addEventListener('mouseout', onOut);
    el.addEventListener('click', onClick);
    (el as any)[HANDLERS] = { onOver, onOut, onClick };
}

function detachListeners(el: HTMLElement) {
    const h = (el as any)[HANDLERS] as { onOver: any; onOut: any; onClick: any } | undefined;
    if (!h) return;
    el.removeEventListener('mouseover', h.onOver);
    el.removeEventListener('mouseout', h.onOut);
    el.removeEventListener('click', h.onClick);
    delete (el as any)[HANDLERS];
}

export const script: Directive<HTMLElement, ScriptDirectiveValue> = {
    mounted(el, binding) {
        applyBinding(el, binding.value);
        attachListeners(el);
    },
    updated(el, binding) {
        applyBinding(el, binding.value);
    },
    beforeUnmount(el) {
        detachListeners(el);
    },
};
