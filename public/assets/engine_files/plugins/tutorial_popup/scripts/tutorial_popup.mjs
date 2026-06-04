/// <reference path="./dtypes.d.ts" />
const { game, vue } = window.engine;
const { ref, computed } = vue;

const queue = ref([]);
const currentId = ref(null);
const warned = new Set();

export const currentRecord = computed(() => currentId.value ? game.getRecord(currentId.value) : null);

export function isShown(recordId) {
  return (game.getState('tutorial_seen') || []).includes(recordId);
}

function markShown(recordId) {
  const seen = game.getState('tutorial_seen') || [];
  if (!seen.includes(recordId)) game.setState('tutorial_seen', [...seen, recordId]);
}

function advance() {
  const next = queue.value.shift();
  if (!next) {
    currentId.value = null;
    game.closePopup('tutorial_hint');
    return;
  }
  currentId.value = next;
  game.openPopup('tutorial_hint');
}

export function showHint(recordId) {
  if (game.getGameSetting('show_tutorial') === false) return;
  if (!recordId || isShown(recordId)) return;
  if (!game.getRecord(recordId)) {
    if (!warned.has(recordId)) {
      warned.add(recordId);
      console.warn(`[tutorial_popup] showHint: record "${recordId}" not found`);
    }
    return;
  }
  if (currentId.value === recordId || queue.value.includes(recordId)) return;
  queue.value.push(recordId);
  if (!currentId.value) advance();
}

export function dismissCurrent() {
  if (currentId.value) markShown(currentId.value);
  if (game.getGameSetting('show_tutorial') === false) {
    queue.value = [];
    currentId.value = null;
    game.closePopup('tutorial_hint');
    return;
  }
  advance();
}

export const tutorialEnabled = computed({
  get: () => game.getGameSetting('show_tutorial') !== false,
  set: (value) => {
    game.setGameSetting('show_tutorial', value);
    if (!value) queue.value = [];
  },
});

export function resetTutorials() {
  game.setState('tutorial_seen', []);
}
