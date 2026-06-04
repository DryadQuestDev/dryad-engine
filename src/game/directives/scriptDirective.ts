import { markRaw, type Directive } from 'vue';
import { Game } from '../game';
import {
    pushTransient,
    hideTransient,
    clickTransient,
    registerLoreKindCard,
    resolveLoreKindCard,
} from '../views/popups/popupStore';
import RecordCard from '../views/popups/cards/RecordCard.vue';
import StatusCard from '../views/popups/cards/StatusCard.vue';

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
    /**
     * Resolve context passed through to `resolveString` as its third argument. Use this
     * when the text contains context-aware placeholders like `|stat(...)|` that read from
     * `game.getResolveContext()?.character`. Required for any popup that renders a
     * character-bound description (status / ability / skill descriptions).
     *
     * @example
     * <div v-script="{ html: status.description, context: { character: props.character } }" />
     */
    context?: Record<string, any>;
    navMode?: boolean;
    onNavigate?: (recordId: string) => void;
    disabled?: boolean;
};

const OPTS = Symbol('de-script-opts');
const HANDLERS = Symbol('de-script-handlers');
const LAST_HTML = Symbol('de-script-last-html');

type NormalizedOpts = {
    html: string;
    resolver: boolean;
    context?: Record<string, any>;
    navMode: boolean;
    onNavigate?: (recordId: string) => void;
    disabled: boolean;
};

// ── Built-in lore-link kind → card factories ──
// scriptDirective owns these registrations because it's where the .lore-link delegation lives.

registerLoreKindCard('record', {
    component: markRaw(RecordCard),
    mapProps: (id) => ({ recordId: id }),
    closable: true,
});

registerLoreKindCard('status', {
    component: markRaw(StatusCard),
    mapProps: (id, ctx) => {
        const character = ctx?.character as { id: string } | undefined;
        return { statusId: id, characterId: character?.id };
    },
    closable: true,
});

function normalize(value: ScriptDirectiveValue | undefined): NormalizedOpts {
    if (typeof value === 'string') {
        return { html: value, resolver: true, navMode: false, disabled: false };
    }
    return {
        html: value?.html ?? '',
        resolver: value?.resolver !== false,
        context: value?.context,
        navMode: value?.navMode === true,
        onNavigate: value?.onNavigate,
        disabled: value?.disabled === true,
    };
}

function applyBinding(el: HTMLElement, value: ScriptDirectiveValue | undefined) {
    const opts = normalize(value);
    (el as any)[OPTS] = opts;

    if (!opts.resolver && (el as any)[LAST_HTML] === opts.html) {
        return;
    }

    const html = opts.resolver
        ? Game.getInstance().resolveString(opts.html, true, opts.context).output
        : opts.html;
    el.innerHTML = html;
    (el as any)[LAST_HTML] = opts.html;
}

function findLink(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest('.lore-link') as HTMLElement | null;
}

function buildEntry(link: HTMLElement, opts: NormalizedOpts): { key: string; component: any; props: any; closable?: boolean } | null {
    const id = link.getAttribute('data-lore-id');
    if (!id) return null;
    const kind = link.getAttribute('data-lore-kind') || 'record';
    const factory = resolveLoreKindCard(kind);
    if (!factory) return null;
    return {
        key: `${kind}:${id}`,
        component: factory.component,
        props: factory.mapProps(id, opts.context),
        closable: factory.closable,
    };
}

function attachListeners(el: HTMLElement) {
    const onOver = (e: MouseEvent) => {
        const opts = (el as any)[OPTS] as NormalizedOpts | undefined;
        if (!opts || opts.disabled || opts.navMode) return;
        const link = findLink(e.target);
        if (!link) return;
        const entry = buildEntry(link, opts);
        if (entry) pushTransient({ ...entry, anchorEl: link });
    };
    const onOut = (e: MouseEvent) => {
        const opts = (el as any)[OPTS] as NormalizedOpts | undefined;
        if (!opts || opts.disabled || opts.navMode) return;
        const link = findLink(e.target);
        if (link) hideTransient(link);
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
        if (opts.navMode) {
            opts.onNavigate?.(id);
            return;
        }
        const entry = buildEntry(link, opts);
        if (entry) clickTransient({ ...entry, anchorEl: link });
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
