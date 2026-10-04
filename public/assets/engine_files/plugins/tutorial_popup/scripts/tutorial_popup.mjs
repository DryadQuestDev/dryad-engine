/// <reference path="./dtypes.d.ts" />
const { game, vue } = window.engine;
const { computed } = vue;

// Hints that arrive while the modal is open become PAGES of the same modal (arrows in the
// footer) instead of a second popup after dismissal. The session is the open modal's page list.
//
// Session and page live in engine STATE, not module refs. The engine saves the open-popup stack
// (`popup_state`), so a save taken while the modal is up reloads with `tutorial_hint` open — and
// backing its pages with a transient ref meant they were gone by then, leaving the modal rendering
// nothing behind a full-screen input-blocking overlay.
const session = () => game.getState('tutorial_session');
const setSession = (ids) => game.setState('tutorial_session', ids);
const page = () => game.getState('tutorial_page');
const setPage = (i) => game.setState('tutorial_page', i);

const warned = new Set();

export const currentRecord = computed(() => {
  const id = session()[page()];
  return id ? game.getRecord(id) : null;
});
export const pageIndex = computed(() => page());
export const pageCount = computed(() => session().length);

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
  if (session().includes(recordId)) return;
  setSession([...session(), recordId]);
  if (session().length === 1) {
    setPage(0);
    game.openPopup('tutorial_hint');
  }
}

export function pageBy(delta) {
  setPage(Math.min(Math.max(page() + delta, 0), session().length - 1));
}

// Got it closes the whole stack: every page is latched, read or not — skipped pages stay
// re-readable in the Encyclopedia (tutorial records are auto_discovery).
export function dismissAll() {
  markShown(session());
  setSession([]);
  setPage(0);
  game.closePopup('tutorial_hint');
}

export const tutorialEnabled = computed({
  get: () => game.getGameSetting('show_tutorial') !== false,
  set: (value) => {
    game.setGameSetting('show_tutorial', value);
    // Turning hints off mid-modal keeps only the page being read; the unread rest are
    // dropped UNLATCHED so they can return if hints are ever re-enabled.
    if (!value && session().length > 1) {
      setSession([session()[page()]]);
      setPage(0);
    }
  },
});

export function resetTutorials() {
  game.setState('tutorial_seen', []);
}
