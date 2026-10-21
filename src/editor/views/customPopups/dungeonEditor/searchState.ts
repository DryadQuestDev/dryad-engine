import { computed, ref } from 'vue';
import type { IndexCategory } from '../../../../utility/dungeonEditor/index';
import type { MetaStatus } from '../../../../utility/dungeonEditor/meta';
import { findBraceRanges, isConditionBrace } from '../../../../utility/dungeonEditor/lint';

/**
 * Shared query for the dungeon content editor's in-popup search bar.
 * Consumed by the popup toolbar (input binding) and by RichContentEditor
 * instances (read-only, to highlight matches inside Quill content).
 *
 * Not persisted — intentionally session-only.
 */
export const dungeonSearchQuery = ref('');

/**
 * Active "structured" filter — picked from the Index dropdowns (Actions,
 * Flags, Anchors, Inventories). Stacks with the free-text search; the popup
 * intersects both into the visible-blocks set.
 */
export const dungeonStructuredFilter = ref<{ kind: IndexCategory; name: string } | null>(null);

/**
 * Active author-status filter. Kept separate from `dungeonStructuredFilter`
 * rather than folded into `IndexCategory`, because status is not indexed
 * content — it is editor-only state that never reaches the runtime, and
 * folding it in would list it among Actions.
 *
 * Stacks with both the free-text search and the structured filter; the popup
 * intersects all three.
 */
export const dungeonStatusFilter = ref<StatusFilter | null>(null);

/**
 * `'none'` is a filter, not a status: it selects blocks that carry no
 * `__meta` status at all — the untriaged remainder. It is deliberately not a
 * `MetaStatus`, because nothing is ever written to a block to mean it.
 */
export type StatusFilter = MetaStatus | 'none';

/**
 * True when `value` contains the trimmed `dungeonSearchQuery` (case-insensitive).
 * Used to tint header / choice / column `<input>` elements whose value matches
 * — `<input>` text can't be sub-string-styled, but the whole field can.
 */
const _normalizedSearch = computed(() => dungeonSearchQuery.value.trim().toLowerCase());
export function inputMatchesSearch(value: string | undefined | null): boolean {
  const q = _normalizedSearch.value;
  if (!q) return false;
  if (!value) return false;
  return value.toLowerCase().includes(q);
}

/**
 * `inputMatchesSearch` for a `{…}` params field (block header, choice, scene
 * column). Also true when the field holds the active structured filter: the
 * index counts actions found in params, so a filter for an action that lives
 * only there (`replay`, `view`) must tint the field or the counter reads 0/0.
 */
export function paramsMatchSearch(value: string | undefined | null): boolean {
  if (inputMatchesSearch(value)) return true;
  const sf = dungeonStructuredFilter.value;
  if (!sf || !value) return false;
  return findStructuredRanges(value, sf.kind, sf.name).length > 0;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Structured-filter match: `name` only in its indexed role (see
 * utility/dungeonEditor/index.ts), never as a plain substring — the word
 * "actor" in prose must not match the `actor` action.
 */
export function findStructuredRanges(text: string, kind: IndexCategory, name: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (!name) return ranges;
  const esc = escapeRegex(name);
  if (kind === 'anchor') {
    const re = new RegExp(`(^|\\n)&${esc}(?!\\w)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const lead = m[1] ? 1 : 0;
      ranges.push([m.index + lead, m.index + m[0].length]);
    }
    return ranges;
  }
  const keyRe = new RegExp(`(^|[{,\\s"'])${esc}(?=\\s*["']?\\s*:)`, 'g');
  const wordRe = new RegExp(`(^|[^\\w.])${esc}(?![\\w.])`, 'g');
  for (const [s, e] of findBraceRanges(text)) {
    // Condition braces hold flag checks, never actions.
    if (kind === 'action' && isConditionBrace(text, s)) continue;
    const re = kind === 'action' ? keyRe : wordRe;
    const seg = text.slice(s, e);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg)) !== null) {
      const start = s + m.index + m[1].length;
      ranges.push([start, start + name.length]);
    }
  }
  return ranges;
}
