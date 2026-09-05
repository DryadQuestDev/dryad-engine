/// <reference path="./dtypes.d.ts" />
const { game, vue } = window.engine;
const { ref, computed } = vue;

// Hints that arrive while the modal is open become PAGES of the same modal (arrows in the
// footer) instead of a second popup after dismissal. The session is the open modal's page list.
const session = ref([]);
const index = ref(0);
const warned = new Set();

export const currentRecord = computed(() => {
  const id = session.value[index.value];
  return id ? game.getRecord(id) : null;
});
export const pageIndex = computed(() => index.value);
export const pageCount = computed(() => session.value.length);

export function isShown(recordId) {
  return (game.getState('tutorial_seen') || []).includes(recordId);
}

function markShown(ids) {
  const seen = game.getState('tutorial_seen') || [];
  const add = ids.filter((id) => !seen.includes(id));
  if (add.length) game.setState('tutorial_seen', [...seen, ...add]);
}

// Dev-only escape hatch, set in the plugin's Config tab. isDevMode() is false for players,
// so this can never gate real play — and it leaves `tutorial_seen` untouched, unlike
// dismissing a hint, so playtests don't burn the one-time popups.
function disabledInDev() {
  return game.isDevMode() &&
    !!game.getData('plugins_data/tutorial_popup/config')?.disable_in_dev_mode;
}

export function showHint(recordId) {
  if (disabledInDev()) return;
  if (game.getGameSetting('show_tutorial') === false) return;
  if (!recordId || isShown(recordId)) return;
  if (!game.getRecord(recordId)) {
    if (!warned.has(recordId)) {
      warned.add(recordId);
      console.warn(`[tutorial_popup] showHint: record "${recordId}" not found`);
    }
    return;
  }
  if (session.value.includes(recordId)) return;
  session.value = [...session.value, recordId];
  if (session.value.length === 1) {
    index.value = 0;
    game.openPopup('tutorial_hint');
  }
}

export function pageBy(delta) {
  index.value = Math.min(Math.max(index.value + delta, 0), session.value.length - 1);
}

// Got it closes the whole stack: every page is latched, read or not — skipped pages stay
// re-readable in the Encyclopedia (tutorial records are auto_discovery).
export function dismissAll() {
  markShown(session.value);
  session.value = [];
  index.value = 0;
  game.closePopup('tutorial_hint');
}

export const tutorialEnabled = computed({
  get: () => game.getGameSetting('show_tutorial') !== false,
  set: (value) => {
    game.setGameSetting('show_tutorial', value);
    // Turning hints off mid-modal keeps only the page being read; the unread rest are
    // dropped UNLATCHED so they can return if hints are ever re-enabled.
    if (!value && session.value.length > 1) {
      session.value = [session.value[index.value]];
      index.value = 0;
    }
  },
});

export function resetTutorials() {
  game.setState('tutorial_seen', []);
}
