import { ref } from 'vue';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import { showConfirm } from '../../../services/dialogService';

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

export function openLoadGamePopup() {
  const editor = Editor.getInstance();
  const global = Global.getInstance();
  if (!editor.selectedGame) {
    global.addNotification('Please select a game first');
    return;
  }
  showLoadGamePopup.value = true;
}
