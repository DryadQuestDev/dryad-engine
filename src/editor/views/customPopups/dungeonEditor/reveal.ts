import type { IssueAnchor } from '../../../../utility/dungeonEditor/lint';

/**
 * A request from the popup to focus one editable inside one block. Passed
 * down as a prop only to the card that owns the block (every other card
 * keeps receiving `null`, so Vue's prop diffing skips them). `seq` makes a
 * repeat jump to the same spot a fresh object, so watchers fire again.
 */
export type RevealRequest = {
  seq: number;
  blockIndex: number;
  at: IssueAnchor;
};

/** The native field behind a PrimeVue InputText/Textarea ref or a plain element. */
function nativeField(target: unknown): HTMLInputElement | HTMLTextAreaElement | null {
  const el = (target as any)?.$el ?? target;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLElement) {
    const inner = el.querySelector('input, textarea');
    if (inner instanceof HTMLInputElement || inner instanceof HTMLTextAreaElement) return inner;
  }
  return null;
}

/** Focus a field, select `[start, end)` inside it, and bring it into view. */
export function focusFieldAt(target: unknown, start?: number, end?: number): boolean {
  const field = nativeField(target);
  if (!field) return false;
  field.focus({ preventScroll: true });
  if (start !== undefined) {
    const len = field.value.length;
    const s = Math.max(0, Math.min(start, len));
    const e = Math.max(s, Math.min(end ?? s + 1, len));
    try {
      field.setSelectionRange(s, e);
    } catch {
      // Some input types refuse selection ranges; focus alone is still useful.
    }
  }
  field.scrollIntoView({ behavior: 'instant', block: 'center' });
  return true;
}

/** Re-trigger the `.flash` animation on an element. */
export function flashElement(el: Element | null | undefined) {
  if (!el) return;
  el.classList.remove('flash');
  // Force a style flush so re-adding the class restarts the animation.
  void (el as HTMLElement).offsetWidth;
  el.classList.add('flash');
  window.setTimeout(() => el.classList.remove('flash'), 1200);
}
