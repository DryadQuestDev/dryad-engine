import { ref } from 'vue';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import { showConfirm } from '../../../services/dialogService';
import { DEV_AUTO_SAVE_SLOT, DEV_PREV_SCENE_SLOT, DEV_REPLAY_SCENE_KEY, DEV_LEFT_SCENE_KEY } from '../../../services/indexeddb-save.service';

// App-singleton refs so multiple toolbars (main editor screen + dungeon
// content editor popup) can both flip these dialogs open. The dialog
// components themselves stay mounted once at the EditorScreen level.
export const showLoadGamePopup = ref(false);
export const showPlaytestModsPopup = ref(false);

function getPlaytestMods(): string[] {
  const editor = Editor.getInstance();
  if (!editor.selectedGame) return [];

  const storageKey = `playtest-mods-${editor.selectedGame}`;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      const storedModIds: string[] = JSON.parse(stored);
      return storedModIds.filter((modId) =>
        editor.mods.some((mod) => mod.id === modId),
      );
    } catch (e) {
      console.error('Failed to parse stored playtest mods:', e);
      return [];
    }
  }
  return [];
}

export async function startPlaytest() {
  const editor = Editor.getInstance();
  const global = Global.getInstance();

  if (!editor.selectedGame) {
    global.addNotification('Please select a game first');
    return;
  }

  if (editor.hasUnsavedChanges.value) {
    const confirmed = await showConfirm({
      message: 'You have unsaved changes. Are you sure you want to start playtesting? All unsaved changes will be lost.',
      header: 'Unsaved Changes',
    });
    if (!confirmed) return;
  }

  localStorage.setItem('devMode', 'true');
  localStorage.setItem('dev_mode_selected_game', editor.selectedGame);

  const storedMods = getPlaytestMods();
  const modList = new Set(storedMods);
  if (editor.selectedMod && editor.selectedMod !== '_core') {
    modList.add(editor.selectedMod);
  }
  localStorage.setItem('dev_mode_selected_mods', JSON.stringify(Array.from(modList)));

  if (editor.selectedMod) {
    localStorage.setItem('dev_mode_selected_mod', editor.selectedMod);
  }

  localStorage.setItem('showDebugPanel', 'true');
  localStorage.setItem('game_starting_new', 'true');
  localStorage.setItem('game_loading_game_id', editor.selectedGame);

  window.location.reload();
}

// Relaunch the last playtest and hard-reset the scene you were on: resumes from the
// pre-scene checkpoint and re-plays that scene (rebuilds edited content, fires actions
// once). If you left outside a scene, resumes the auto-save normally.
export async function continuePlaytest() {
  const editor = Editor.getInstance();
  const global = Global.getInstance();

  if (!editor.selectedGame) {
    global.addNotification('Please select a game first');
    return;
  }
  const gameId = editor.selectedGame;

  const leftScene = localStorage.getItem(DEV_LEFT_SCENE_KEY);
  const slot = leftScene ? DEV_PREV_SCENE_SLOT : DEV_AUTO_SAVE_SLOT;

  // Nothing to continue if the chosen dev save doesn't exist yet.
  const existing = await global.indexedDbSaveService.load(gameId, slot);
  if (!existing) {
    global.addNotification('No playtest to continue — start a Playtest first');
    return;
  }

  // Same dev-mode setup as startPlaytest.
  localStorage.setItem('devMode', 'true');
  localStorage.setItem('dev_mode_selected_game', gameId);

  const storedMods = getPlaytestMods();
  const modList = new Set(storedMods);
  if (editor.selectedMod && editor.selectedMod !== '_core') {
    modList.add(editor.selectedMod);
  }
  localStorage.setItem('dev_mode_selected_mods', JSON.stringify(Array.from(modList)));

  if (editor.selectedMod) {
    localStorage.setItem('dev_mode_selected_mod', editor.selectedMod);
  }

  localStorage.setItem('showDebugPanel', 'true');

  // Hard-reset the scene only if we left inside one; otherwise plain resume.
  if (leftScene) {
    localStorage.setItem(DEV_REPLAY_SCENE_KEY, '1');
  }

  localStorage.setItem('game_loading_slot', slot);
  localStorage.setItem('game_loading_game_id', gameId);

  window.location.reload();
}

export function openLoadGamePopup() {
  const editor = Editor.getInstance();
  const global = Global.getInstance();
  if (!editor.selectedGame) {
    global.addNotification('Please select a game first');
    return;
  }
  showLoadGamePopup.value = true;
}
