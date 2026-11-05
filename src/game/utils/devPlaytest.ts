import { computed, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import { Game } from '../game';
import { Global } from '../../global/global';
import {
  DEV_AUTO_SAVE_SLOT, DEV_REPLAY_SCENE_KEY, DEV_LEFT_SCENE_KEY, DEV_OPEN_IN_EDITOR_KEY, DEV_PLAY_FROM_KEY,
  type PlayFromMarker,
} from '../../services/indexeddb-save.service';
import { peekCheckpoint } from '../../services/devCheckpoints';
import { addSnapshot, getSnapshot, newSnapshotSlot, type DevSnapshot } from '../../services/devSnapshots';
import { gameLogger } from './logger';

/**
 * Dev playtest controls shared by the debug panel buttons and their keys (Shift+R, PageUp,
 * Shift+S). The keys are installed by GameScreen, so they work with the panel hidden.
 */

export const HARD_RESET_KEY = 'Shift+R';
export const STEP_BACK_KEY = 'PageUp';
export const TOGGLE_PANEL_KEY = 'Shift+D';
export const SNAPSHOT_KEY = 'Shift+S';

/** The panel folded to a slim strip at the window's edge, so the game gets its full width. */
export const debugPanelCollapsed = useStorage('debug-panel-collapsed', false);

/** Where the player is, in the editor's terms. */
export const playPosition = computed(() => {
  const ds = Game.getInstance().dungeonSystem;
  return {
    dungeonId: ds.activeDungeonId.value ?? ds.currentDungeonId.value ?? null,
    roomId: ds.currentRoom.value?.id ?? null,
    sceneId: ds.currentSceneId.value ?? null,
  };
});

/**
 * Save and return to the editor, which then opens the Content tab on `target` (by default the
 * paragraph on screen). The editor's Continue still resumes where the player left.
 */
export async function backToEditor(target?: { sceneId: string | null; dungeonId: string | null }): Promise<void> {
  const game = Game.getInstance();
  const here = playPosition.value;
  const leftScene = here.sceneId;
  if (leftScene) localStorage.setItem(DEV_LEFT_SCENE_KEY, leftScene);
  else localStorage.removeItem(DEV_LEFT_SCENE_KEY);
  const at = target ?? here;
  if (at.dungeonId) {
    localStorage.setItem(DEV_OPEN_IN_EDITOR_KEY, JSON.stringify({
      gameId: game.coreSystem.gameId,
      dungeonId: at.dungeonId,
      sceneId: at.sceneId,
      roomId: target ? null : here.roomId,
    }));
  }
  try {
    await game.saveGame(DEV_AUTO_SAVE_SLOT);
  } catch (error) {
    console.error('Failed to auto-save:', error);
    Global.getInstance().addNotificationId('auto_save_failed');
  }
  // A reload clears the game's custom JS and CSS before the editor mounts.
  localStorage.setItem('returning_to_editor', 'true');
  window.location.reload();
}

// Re-assert dev flags before a reload: a second app instance (the editor) shares localStorage and
// can clear devMode, which would otherwise reload the game with the debug panel gone.
function keepDevFlags(): void {
  localStorage.setItem('devMode', 'true');
  localStorage.setItem('showDebugPanel', 'true');
}

/** Reload into a checkpoint slot and replay its paragraph on the state it had then. */
export function replayCheckpoint(slot: string): void {
  keepDevFlags();
  localStorage.setItem(DEV_REPLAY_SCENE_KEY, '1');
  Game.getInstance().loadGame(slot);
}

/**
 * In a scene: reload into the newest checkpoint (taken just before the paragraph on screen ran
 * its actions) and replay that paragraph, so edited content shows and its actions fire once on
 * clean state. The checkpoint carries its own currentSceneId, so the replay flag needs no scene id.
 * Outside a scene, or with no checkpoint yet: save where we stand and reload into it.
 */
export async function hardSceneReset(): Promise<void> {
  const game = Game.getInstance();
  const newest = game.dungeonSystem.currentSceneId.value ? peekCheckpoint(game.coreSystem.gameId) : null;
  if (newest) {
    replayCheckpoint(newest);
    return;
  }

  keepDevFlags();
  // Keep the editor's "Continue" marker honest: outside a scene it resumes the auto-save.
  localStorage.removeItem(DEV_LEFT_SCENE_KEY);
  // forceSave: the current state may have saves disabled (replay mode etc.), but a dev
  // reload still needs a checkpoint to come back to.
  await game.saveGame(DEV_AUTO_SAVE_SLOT, { noNotification: true, forceSave: true });
  game.loadGame(DEV_AUTO_SAVE_SLOT);
}

// In a scene the newest checkpoint is the paragraph on screen, so one click back is the one before
// it. Outside a scene the newest is the paragraph that ended the last scene.
const stepBackSlot = computed(() => {
  const game = Game.getInstance();
  return peekCheckpoint(game.coreSystem.gameId, game.dungeonSystem.currentSceneId.value ? 1 : 0);
});

export const canStepBack = computed(() => !!stepBackSlot.value);

/** Reload the paragraph one click back on clean state and replay it. */
export function stepBack(): void {
  const slot = stepBackSlot.value;
  if (slot) replayCheckpoint(slot);
}

/** The snapshot just taken whose name the panel is asking for; null when none. */
export const namingSnapshotId = ref<string | null>(null);

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/[*_]+/g, '').replace(/\s+/g, ' ').trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/** A name to start from: the paragraph on screen, or where the player stands. */
function defaultSnapshotName(): string {
  const ds = Game.getInstance().dungeonSystem;
  const text = ds.currentSceneId.value ? plainText(ds.cachedText.value ?? '') : '';
  if (text) return clip(text, 36);
  const place = playPosition.value;
  return [place.dungeonId, place.roomId].filter(Boolean).join(' › ') || 'Snapshot';
}

/** A few story values to tell snapshots apart: the properties no longer at their default. */
function snapshotSummary(): string {
  const parts: string[] = [];
  for (const [id, property] of Game.getInstance().coreSystem.properties.value) {
    const value = property.currentValue;
    if (property.skipSave || value === property.defaultValue) continue;
    if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') continue;
    if (typeof value === 'string' && value.length > 16) continue;
    parts.push(`${id} ${value}`);
  }
  return parts.length > 3 ? `${parts.slice(0, 3).join(', ')}…` : parts.join(', ');
}

function panelOnScreen(): boolean {
  return localStorage.getItem('showDebugPanel') !== 'false' && !debugPanelCollapsed.value;
}

/**
 * Save this moment as a new snapshot (a hidden save of its own). With the panel on screen it then
 * asks for a name; folded away, the suggested name stands and a notification says so.
 */
export async function takeSnapshot(): Promise<DevSnapshot | null> {
  const game = Game.getInstance();
  const gameId = game.coreSystem.gameId;
  const { id, slot } = newSnapshotSlot();
  // Read before the save awaits: the place and name belong to the moment of the key press.
  const here = playPosition.value;
  const snapshot: DevSnapshot = {
    id, slot, name: defaultSnapshotName(), savedAt: Date.now(),
    dungeonId: here.dungeonId, roomId: here.roomId, sceneId: here.sceneId, summary: snapshotSummary(),
  };
  // forceSave: like the checkpoints, a snapshot is taken even where the game disables saving.
  const saved = await game.coreSystem.saveGame(game, slot, { hidden: true, noNotification: true, forceSave: true });
  if (!saved) {
    Global.getInstance().addNotification('Snapshot not saved');
    return null;
  }
  addSnapshot(gameId, snapshot);
  if (panelOnScreen()) namingSnapshotId.value = id;
  else Global.getInstance().addNotification(`Snapshot saved: ${snapshot.name}`);
  return snapshot;
}

/** Load a snapshot as a dev save: its own state and place, on a fresh run of checkpoints. */
export function loadSnapshot(id: string): void {
  const game = Game.getInstance();
  const snapshot = getSnapshot(game.coreSystem.gameId, id);
  if (!snapshot) return;
  keepDevFlags();
  game.loadGame(snapshot.slot);
}

/**
 * Read the editor's Play from here marker, once, if it is meant for this boot: a new game, or the
 * load of the snapshot it names. Dev mode only. A match holds room events until finishPlayFrom,
 * so the room the game starts in cannot play its own scene first.
 */
export function takePlayFrom(gameId: string, loadingSlot: string | null): PlayFromMarker | null {
  if (localStorage.getItem('devMode') !== 'true') return null;
  const raw = localStorage.getItem(DEV_PLAY_FROM_KEY);
  if (!raw) return null;
  localStorage.removeItem(DEV_PLAY_FROM_KEY);
  let marker: PlayFromMarker;
  try {
    marker = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!marker || marker.gameId !== gameId || !marker.target || !marker.dungeonId) return null;
  const slot = marker.start === 'new' ? null : getSnapshot(gameId, marker.start)?.slot;
  if (slot === undefined || slot !== loadingSlot) return null;
  Game.getInstance().dungeonSystem.holdRoomEvents = true;
  return marker;
}

/** Undo takePlayFrom's hold when the boot it was meant for failed. */
export function dropPlayFrom(): void {
  Game.getInstance().dungeonSystem.holdRoomEvents = false;
}

/** Run the marker's Set-first actions, then play its target where it lives. */
export function finishPlayFrom(marker: PlayFromMarker): void {
  const game = Game.getInstance();
  const ds = game.dungeonSystem;
  try {
    if (marker.actions?.trim()) game.logicSystem.resolveActions(marker.actions);
    moveToTarget(marker);
    if (marker.target.startsWith('~')) playBranch(marker.target, marker.dungeonId);
    else ds.playScene(marker.target, marker.dungeonId);
  } catch (error) {
    gameLogger.error(`[play from] Could not play "${marker.target}"`, error);
  } finally {
    ds.holdRoomEvents = false;
  }
}

/** Stand in the target's room, so its art, music and map are the ones around it. */
function moveToTarget(marker: PlayFromMarker): void {
  const ds = Game.getInstance().dungeonSystem;
  const roomId = marker.target.slice(1).split('.')[0];
  const here = ds.currentDungeonId.value === marker.dungeonId && ds.currentRoomId.value === roomId;
  // A room the dungeon doesn't know plays the target from where the player is, as {scene} would.
  if (here || !ds.dungeonRooms.get(marker.dungeonId)?.has(roomId)) {
    if (ds.currentSceneId.value) ds.resetScene();
    return;
  }
  // A move a scene makes skips the room's lock and the weight limit; this one stands in for a scene.
  const standIn = !ds.currentSceneId.value;
  if (standIn) ds.currentSceneId.value = marker.target;
  ds.enter(`${marker.dungeonId}.${roomId}`);
  // Still set: the room refused the entry, so the stand-in (or the loaded scene) is left over.
  if (standIn && ds.currentSceneId.value === marker.target) ds.currentSceneId.value = null;
  else if (ds.currentSceneId.value) ds.resetScene();
}

/** Play a `~` branch as if the player picked it: its own actions, then the text under it. */
function playBranch(target: string, dungeonId: string): void {
  const game = Game.getInstance();
  const ds = game.dungeonSystem;
  const line = ds.dungeonLines.get(dungeonId)?.get(target);
  if (!line) {
    gameLogger.error(`[play from] No branch "${target}" in dungeon "${dungeonId}"`);
    return;
  }
  const params: Record<string, any> = line.params ? JSON.parse(JSON.stringify(line.params)) : {};
  const start = `#${target.slice(1)}.1`;
  const delayed = Object.keys(ds.getDelayedActions(line.params)).length > 0;
  // The dungeon is spelled out: a branch played from another dungeon's room still reads its own lines.
  if (!delayed) params.scene = `#${dungeonId}.${start.slice(1)}`;
  const choice = game.createCustomChoice({ id: target, name: line.val, params });
  if (delayed) choice.resumeSceneId = start;
  if (choice.isChoiceAvailable()) {
    choice.do();
    return;
  }
  gameLogger.warn(`[play from] "${target}" is greyed out by its active condition; playing it anyway.`);
  game.logicSystem.resolveActions(params);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
    || target.isContentEditable;
}

function onDevKey(event: KeyboardEvent): void {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;

  if (event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    hardSceneReset();
  } else if (event.shiftKey && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    debugPanelCollapsed.value = !debugPanelCollapsed.value;
  } else if (event.shiftKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    takeSnapshot();
  } else if (!event.shiftKey && event.key === 'PageUp') {
    event.preventDefault();
    stepBack();
  }
}

/** Listen for the dev playtest keys; returns the uninstaller. */
export function installDevPlaytestKeys(): () => void {
  window.addEventListener('keydown', onDevKey);
  return () => window.removeEventListener('keydown', onDevKey);
}
