import { computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { Editor } from './editor';

/** The loop a new game teaches, in order. Each step ticks itself from the editor call that does it. */
export const FIRST_STEPS = [
  { id: 'playtest', label: 'Playtest' },
  { id: 'back', label: 'Back to Editor' },
  { id: 'change', label: 'Change a line' },
  { id: 'continue', label: 'Save, then Continue' },
] as const;

export type FirstStepId = typeof FIRST_STEPS[number]['id'];

type GameSteps = { done: FirstStepId[]; dismissed?: boolean };

// Per game: only games created from a template have an entry, so only they show the banner.
// Written synchronously: Playtest and Continue tick a step right before they reload the page.
const stepsByGame = useStorage<Record<string, GameSteps>>('editor_first_steps', {}, localStorage, { flush: 'sync' });

export function enableFirstSteps(gameId: string) {
  stepsByGame.value = { ...stepsByGame.value, [gameId]: { done: [] } };
}

export function markFirstStep(step: FirstStepId, gameId: string | null = Editor.getInstance().selectedGame) {
  if (!gameId) return;
  const entry = stepsByGame.value[gameId];
  if (!entry || entry.dismissed || entry.done.includes(step)) return;
  stepsByGame.value = { ...stepsByGame.value, [gameId]: { ...entry, done: [...entry.done, step] } };
}

export function dismissFirstSteps(gameId: string) {
  const entry = stepsByGame.value[gameId];
  if (!entry) return;
  stepsByGame.value = { ...stepsByGame.value, [gameId]: { ...entry, dismissed: true } };
}

/** The selected game's steps, or null when it shows no banner. */
export const currentFirstSteps = computed<GameSteps | null>(() => {
  const game = Editor.getInstance().selectedGame;
  const entry = game ? stepsByGame.value[game] : undefined;
  return entry && !entry.dismissed ? entry : null;
});
