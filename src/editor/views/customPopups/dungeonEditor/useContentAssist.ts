import { inject, nextTick, onBeforeUnmount, ref, shallowRef, watch, type InjectionKey, type Ref, type ShallowRef } from 'vue';
import {
  completeAt, describeAt,
  type AssistMode, type AssistPlace, type Candidate, type Completion, type HoverInfo, type JumpTarget,
} from '../../../../utility/dungeonEditor/assist';
import { caretRect, offsetAtPoint } from './textareaMeasure';

/** What the dungeon content popup hands every editable it holds (the game's debug panel has its own). */
export type ContentAssistProvider = {
  /** What the checks know about the text in `el`, or null until the check context is built. */
  place(el: HTMLElement, mode: AssistMode): AssistPlace | null;
  /** Whether the list opens by itself while typing; the hotkey always opens it. */
  autoOpen: Ref<boolean>;
  /** Ctrl+click on an id; without it, ids are only described. */
  jump?(target: JumpTarget): void;
  /** The editable whose list or hover card is showing: the popup draws one layer for all of them. */
  active: ShallowRef<ContentAssist | null>;
};

export const CONTENT_ASSIST: InjectionKey<ContentAssistProvider> = Symbol('contentAssist');

export type ContentAssist = ReturnType<typeof useContentAssist>;

const HOVER_DELAY = 400;

/**
 * Completion and hover for one textarea. Ctrl+Space opens the list anywhere; with auto-open on it
 * also opens while typing where something can be offered. A pause over an id shows what it is,
 * and Ctrl+click jumps to it.
 */
export function useContentAssist(
  taRef: Ref<HTMLTextAreaElement | null>,
  mode: () => AssistMode | undefined,
  provider: ContentAssistProvider | null = inject(CONTENT_ASSIST, null),
) {
  const list = shallowRef<Completion | null>(null);
  const active = ref(0);
  /** What has been typed of the token so far, for the list to bold. */
  const token = ref('');
  const anchor = shallowRef<DOMRect | null>(null);
  const hover = shallowRef<{ info: HoverInfo; x: number; y: number } | null>(null);
  let explicit = false;
  let hoverTimer = 0;

  function placeFor(): AssistPlace | null {
    const ta = taRef.value;
    const m = mode();
    return ta && m && provider ? provider.place(ta, m) : null;
  }

  function open(isExplicit: boolean) {
    const ta = taRef.value;
    const place = placeFor();
    if (!ta || !place || ta.selectionStart !== ta.selectionEnd) return close();
    const keepExplicit = isExplicit || (explicit && list.value !== null);
    const c = completeAt(ta.value, ta.selectionStart, place, keepExplicit);
    if (!c) return close();
    const sameSlot = list.value?.start === c.start;
    list.value = c;
    token.value = ta.value.slice(c.start, ta.selectionStart);
    explicit = keepExplicit;
    active.value = sameSlot ? Math.min(active.value, c.items.length - 1) : 0;
    anchor.value = caretRect(ta, c.start);
    hover.value = null;
  }

  function close() {
    list.value = null;
    explicit = false;
  }

  function accept(item: Candidate | undefined) {
    const ta = taRef.value;
    const c = list.value;
    if (!ta || !c || !item) return;
    const insert = item.text + (item.after ?? '');
    ta.focus();
    ta.setSelectionRange(c.start, c.end);
    // The only programmatic edit that lands in the browser's undo stack.
    if (!document.execCommand('insertText', false, insert)) {
      ta.setRangeText(insert, c.start, c.end, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (item.caretBack) {
      const pos = ta.selectionStart - item.caretBack;
      ta.setSelectionRange(pos, pos);
    }
    close();
    // A key whose value goes in quotes offers that value next.
    if (item.after?.endsWith('""') && provider?.autoOpen.value) nextTick(() => open(false));
  }

  function onKeydown(e: KeyboardEvent) {
    hideHover();
    if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
      e.preventDefault();
      open(true);
      return;
    }
    const c = list.value;
    if (!c) return;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = c.items.length;
      active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if ((e.key === 'Enter' || e.key === 'Tab') && plain) {
      e.preventDefault();
      e.stopImmediatePropagation();
      accept(c.items[active.value]);
    } else if (e.key === 'Escape') {
      // Marked handled: the app's own Escape opens its menu otherwise.
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      setTimeout(() => list.value && open(explicit));
    }
  }

  function onInput(e: Event) {
    if (list.value) { open(explicit); return; }
    const type = (e as InputEvent).inputType ?? '';
    if (provider?.autoOpen.value && type.startsWith('insert') && type !== 'insertFromPaste') open(false);
  }

  function onClick() {
    if (list.value) open(explicit);
  }

  function onBlur() {
    close();
    hideHover();
  }

  function hideHover() {
    clearTimeout(hoverTimer);
    hover.value = null;
  }

  function infoAt(x: number, y: number): HoverInfo | null {
    const ta = taRef.value;
    const place = placeFor();
    if (!ta || !place) return null;
    const offset = offsetAtPoint(ta, x, y);
    const info = offset < 0 ? null : describeAt(ta.value, offset, place);
    return info && !provider?.jump ? { ...info, jump: undefined } : info;
  }

  function onMouseMove(e: MouseEvent) {
    if (list.value || e.buttons) return;
    const h = hover.value;
    if (h && Math.abs(e.clientX - h.x) < 6 && Math.abs(e.clientY - h.y) < 6) return;
    hideHover();
    const { clientX: x, clientY: y } = e;
    hoverTimer = window.setTimeout(() => {
      const info = infoAt(x, y);
      hover.value = info ? { info, x, y } : null;
    }, HOVER_DELAY);
  }

  function onMouseDown(e: MouseEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0 || !provider?.jump) return;
    const info = infoAt(e.clientX, e.clientY);
    if (!info?.jump) return;
    e.preventDefault();
    hideHover();
    provider.jump(info.jump);
  }

  function onScroll() {
    close();
    hideHover();
  }

  function attach(ta: HTMLTextAreaElement) {
    ta.addEventListener('keydown', onKeydown, { capture: true });
    ta.addEventListener('input', onInput);
    ta.addEventListener('click', onClick);
    ta.addEventListener('blur', onBlur);
    ta.addEventListener('mousemove', onMouseMove);
    ta.addEventListener('mouseleave', hideHover);
    ta.addEventListener('mousedown', onMouseDown);
    ta.addEventListener('scroll', onScroll);
  }

  function detach(ta: HTMLTextAreaElement) {
    ta.removeEventListener('keydown', onKeydown, { capture: true });
    ta.removeEventListener('input', onInput);
    ta.removeEventListener('click', onClick);
    ta.removeEventListener('blur', onBlur);
    ta.removeEventListener('mousemove', onMouseMove);
    ta.removeEventListener('mouseleave', hideHover);
    ta.removeEventListener('mousedown', onMouseDown);
    ta.removeEventListener('scroll', onScroll);
  }

  // The list anchors to the caret: a page scroll would leave it floating elsewhere. Scrolling
  // the list itself is not one.
  const onPageScroll = (e: Event) => {
    if (e.target === taRef.value) return;
    if (e.target instanceof Element && e.target.closest('.assist-list')) return;
    onScroll();
  };
  watch(list, (now, was) => {
    if (now && !was) window.addEventListener('scroll', onPageScroll, true);
    if (!now && was) window.removeEventListener('scroll', onPageScroll, true);
  });

  const self = { list, active, token, anchor, hover, accept, close };
  // Whatever this editable shows takes the popup's one layer; it lets go when nothing shows.
  watch([list, hover], ([l, h]) => {
    if (!provider) return;
    if (l || h) provider.active.value = self;
    else if (provider.active.value === self) provider.active.value = null;
  });

  if (provider) {
    watch(taRef, (ta, old) => {
      if (old) detach(old);
      if (ta) attach(ta);
    }, { immediate: true });
  }

  onBeforeUnmount(() => {
    if (provider?.active.value === self) provider.active.value = null;
    if (taRef.value) detach(taRef.value);
    window.removeEventListener('scroll', onPageScroll, true);
    clearTimeout(hoverTimer);
  });

  return self;
}
