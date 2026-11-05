import { ref } from 'vue';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import { showConfirm } from '../../../services/dialogService';
import { DEV_AUTO_SAVE_SLOT, DEV_REPLAY_SCENE_KEY, DEV_LEFT_SCENE_KEY, DEV_PLAY_FROM_KEY, type PlayFromMarker } from '../../../services/indexeddb-save.service';
import { peekCheckpoint } from '../../../services/devCheckpoints';
import { getSnapshot } from '../../../services/devSnapshots';
import { markFirstStep } from '../../firstSteps';
import { rememberSetup, setFirstAction, type PlaySetup, type PlayTarget } from '../../playFrom';

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

// False when the user keeps their unsaved changes instead.
async function confirmUnsavedChanges(): Promise<boolean> {
  if (!Editor.getInstance().hasUnsavedChanges.value) return true;
  return showConfirm({
    message: 'You have unsaved changes. Are you sure you want to start playtesting? All unsaved changes will be lost.',
    header: 'Unsaved Changes',
  });
}

// The dev-mode setup every playtest boots with: the game, its mods and the debug panel.
function setDevPlaytestFlags(gameId: string) {
  const editor = Editor.getInstance();
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
  // Only launchPlaytest writes a fresh one; any other playtest must not pick up an old one.
  localStorage.removeItem(DEV_PLAY_FROM_KEY);
}

export async function startPlaytest() {
  const editor = Editor.getInstance();
  const global = Global.getInstance();

  if (!editor.selectedGame) {
    global.addNotification('Please select a game first');
    return;
  }

  if (!await confirmUnsavedChanges()) return;

  setDevPlaytestFlags(editor.selectedGame);
  localStorage.setItem('game_starting_new', 'true');
  localStorage.setItem('game_loading_game_id', editor.selectedGame);

  markFirstStep('playtest');
  window.location.reload();
}

/**
 * Playtest from a snapshot (a named dev save), or from `target` when one is given: the game
 * starts as `setup` says, runs its Set-first values, then plays the target.
 */
async function launchPlaytest(start: string, target?: PlayTarget, setup?: PlaySetup) {
  const editor = Editor.getInstance();
  const global = Global.getInstance();
  const gameId = editor.selectedGame;
  if (!gameId) {
    global.addNotification('Please select a game first');
    return;
  }
  const snapshot = start === 'new' ? null : getSnapshot(gameId, start);
  if (start !== 'new' && !snapshot) {
    global.addNotification('That snapshot is gone');
    return;
  }

  if (!await confirmUnsavedChanges()) return;

  setDevPlaytestFlags(gameId);
  if (target && setup) {
    rememberSetup(gameId, target, setup);
    const marker: PlayFromMarker = {
      gameId,
      dungeonId: target.dungeonId,
      target: target.id,
      start,
      actions: setFirstAction(setup.rows, target.dungeonId),
    };
    localStorage.setItem(DEV_PLAY_FROM_KEY, JSON.stringify(marker));
  }
  if (snapshot) {
    localStorage.setItem('game_loading_slot', snapshot.slot);
  } else {
    localStorage.setItem('game_starting_new', 'true');
  }
  localStorage.setItem('game_loading_game_id', gameId);

  markFirstStep('playtest');
  window.location.reload();
}

/** Play from here: start as `setup` says, set its values, then play `target`. */
export function playFromTarget(target: PlayTarget, setup: PlaySetup) {
  return launchPlaytest(setup.start, target, setup);
}

/** Playtest from a snapshot, in its own state and place. */
export function playSnapshot(snapshotId: string) {
  return launchPlaytest(snapshotId);
}

// Relaunch the last playtest and replay the paragraph you were on: resumes from the
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

  // Left mid-scene: the newest checkpoint. Loading it with the replay flag rewinds the ring
  // (syncCheckpointsOnLoad), so the replay overwrites it instead of stacking a duplicate.
  // A load mid-scene (a save, a snapshot) starts an empty ring, so until a paragraph plays there
  // is no replay point: resume the auto-save Back to Editor wrote, as it was.
  const leftScene = localStorage.getItem(DEV_LEFT_SCENE_KEY);
  const checkpoint = leftScene ? peekCheckpoint(gameId) : null;
  const slot = checkpoint ?? DEV_AUTO_SAVE_SLOT;

  // Nothing to continue if the chosen dev save doesn't exist yet.
  const existing = await global.indexedDbSaveService.load(gameId, slot);
  if (!existing) {
    global.addNotification('No playtest to continue — start a Playtest first');
    return;
  }

  setDevPlaytestFlags(gameId);

  // Replay the paragraph only from its checkpoint; otherwise plain resume.
  if (checkpoint) {
    localStorage.setItem(DEV_REPLAY_SCENE_KEY, '1');
  }

  localStorage.setItem('game_loading_slot', slot);
  localStorage.setItem('game_loading_game_id', gameId);

  markFirstStep('continue');
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
