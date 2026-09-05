import { ref } from 'vue';

/**
 * Shared item-category filter state for the Exchange overlay.
 *
 * Both panels (party + trader) render their own tab bar but read and write this
 * one ref, so picking a category on either side filters both grids at once —
 * the point of the bar is comparing what you carry against what the trader
 * stocks, which only works when the two sides agree on what is on screen.
 *
 * A module ref (same idiom as `useExchangeInspect`) rather than game state: it
 * is throwaway UI selection and must never reach a save file.
 */
export const selectedCategory = ref<string>('all');

/** Sentinel category id for the built-in quest tab — matches no game-defined category. */
export const QUEST_FILTER = '__quest';

/** Rarity tier the built-in quest tab collects. */
export const QUEST_RARITY = 'quest';

/** Called when the overlay opens so a category picked in a previous trade never carries over. */
export function resetExchangeFilter() {
  selectedCategory.value = 'all';
}
