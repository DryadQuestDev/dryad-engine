import { computed, ref } from 'vue';
import type { IndexCategory } from '../../../../utility/dungeonEditor/index';
import type { MetaStatus } from '../../../../utility/dungeonEditor/meta';

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
