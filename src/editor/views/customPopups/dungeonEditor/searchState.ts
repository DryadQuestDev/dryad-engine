import { computed, ref } from 'vue';
import type { IndexCategory } from '../../../../utility/dungeonEditor/index';

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
