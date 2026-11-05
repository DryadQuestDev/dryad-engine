import { shallowRef } from 'vue';
import { Editor } from './editor';
import { DEV_OPEN_IN_EDITOR_KEY } from '../services/indexeddb-save.service';

export type PlayPlace = { dungeonId: string; sceneId: string | null; roomId: string | null };

/** Where the content editor should land once it has that dungeon loaded; it clears this itself. */
export const pendingPlace = shallowRef<PlayPlace | null>(null);

/**
 * Read the marker a playtest leaves when it hands over (Back to Editor, Open in editor) and open
 * that dungeon's Content tab. Runs once, after the editor's own boot.
 */
export async function openPlaceFromGame(): Promise<void> {
  const raw = localStorage.getItem(DEV_OPEN_IN_EDITOR_KEY);
  if (!raw) return;
  localStorage.removeItem(DEV_OPEN_IN_EDITOR_KEY);
  let marker: { gameId?: string; dungeonId?: string; sceneId?: string | null; roomId?: string | null };
  try {
    marker = JSON.parse(raw);
  } catch {
    return;
  }
  if (!marker?.dungeonId) return;
  const editor = Editor.getInstance();
  if (marker.gameId && marker.gameId !== editor.selectedGame) {
    if (!editor.games.some(g => g.id === marker.gameId)) return;
    await editor.setGame(marker.gameId);
    if (editor.selectedGame !== marker.gameId) return;
  }
  editor.state.selectedSubTabs['dungeons'] = 'content';
  await editor.setDungeon(marker.dungeonId, true);
  await editor.setMainTab('dungeons');
  // Only now: each load above rebuilds the content editor's cards, which would drop the landing.
  pendingPlace.value = { dungeonId: marker.dungeonId, sceneId: marker.sceneId ?? null, roomId: marker.roomId ?? null };
}
