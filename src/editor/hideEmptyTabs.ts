import { computed, shallowRef, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import { Editor } from './editor';
import { Global } from '../global/global';

// Per game: game id -> hide tabs whose data files are empty. A game created from a template
// starts with it on; the template's own data decides what a newcomer sees.
const hideEmptyByGame = useStorage<Record<string, boolean>>('editor_hide_empty_tabs', {});

export const hideEmptyOn = computed<boolean>(() => {
  const game = Editor.getInstance().selectedGame;
  return !!game && !!hideEmptyByGame.value[game];
});

export function setHideEmpty(gameId: string, on: boolean) {
  hideEmptyByGame.value = { ...hideEmptyByGame.value, [gameId]: on };
}

// Every game has one, so it says nothing about what the author uses.
const NOT_DATA = new Set(['dev/dev_settings']);

// "main/sub" of every subtab whose data file has entries in the game's own layers (_core and the
// selected mod). Plugin defaults from plugin.json are not files there, so they never count.
// null until the first scan lands: until then nothing is hidden.
const withData = shallowRef<Set<string> | null>(null);
let scanSeq = 0;

function hasEntries(json: unknown): boolean {
  if (Array.isArray(json)) return json.length > 0;
  return !!json && typeof json === 'object' && Object.keys(json).length > 0;
}

/** The game's own layers: _core, plus the selected mod. */
function layers(): string[] {
  const editor = Editor.getInstance();
  return editor.selectedMod && editor.selectedMod !== '_core' ? ['_core', editor.selectedMod] : ['_core'];
}

/**
 * Which of `files` (tab file ids such as 'properties' or 'plugins_data/x/y') exist in a layer.
 * Folders are listed instead of reading every file: most empty tabs have no file at all, and a
 * read of a missing one is a failed request in the console.
 */
async function existingFiles(layer: string, files: string[]): Promise<Set<string>> {
  const global = Global.getInstance();
  const base = `games_files/${Editor.getInstance().selectedGame}/${layer}`;
  const dirs = new Set(files.map(f => f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''));
  const found = new Set<string>();
  await Promise.all([...dirs].map(async dir => {
    const path = dir ? `${base}/${dir}` : base;
    if (!(await global.pathExists(path).catch(() => false))) return;
    for (const name of await global.listFiles(path).catch(() => [] as string[])) {
      if (name.endsWith('.json')) found.add(dir ? `${dir}/${name.slice(0, -5)}` : name.slice(0, -5));
    }
  }));
  return found;
}

/** Scan the data files of every tab, or of one subtab after a save changed it. */
export async function refreshTabData(only?: { main: string; sub: string }) {
  const editor = Editor.getInstance();
  if (!editor.selectedGame) return;
  // A full scan supersedes any older one still reading; a one-tab refresh never cancels it.
  const seq = only ? scanSeq : ++scanSeq;
  const targets: { key: string; file: string }[] = [];
  for (const tab of editor.getAllTabs()) {
    for (const sub of tab.subtabs) {
      if (only && (tab.id !== only.main || sub.id !== only.sub)) continue;
      if (!sub.file || sub.file.includes('[dungeon]') || NOT_DATA.has(sub.file)) continue;
      targets.push({ key: `${tab.id}/${sub.id}`, file: sub.file });
    }
  }
  const game = editor.selectedGame;
  const perLayer = await Promise.all(layers().map(async layer => ({ layer, files: await existingFiles(layer, targets.map(t => t.file)) })));
  const results = await Promise.all(targets.map(async t => {
    for (const { layer, files } of perLayer) {
      if (!files.has(t.file)) continue;
      const json = await Global.getInstance().readJson(`games_files/${game}/${layer}/${t.file}.json`).catch(() => null);
      if (hasEntries(json)) return [t.key, true] as const;
    }
    return [t.key, false] as const;
  }));
  if (seq !== scanSeq) return;
  const next = only && withData.value ? new Set(withData.value) : new Set<string>();
  for (const [key, has] of results) {
    if (has) next.add(key);
    else next.delete(key);
  }
  withData.value = next;
}

/** Whether a subtab shows: always without the switch, and always for the open subtab and the dungeon tabs. */
export function subtabShown(mainId: string, subId: string): boolean {
  if (!hideEmptyOn.value || !withData.value) return true;
  if (mainId === 'start' || mainId === 'new' || mainId === 'dungeons') return true;
  const editor = Editor.getInstance();
  if (editor.mainTab === mainId && editor.secondaryTab === subId) return true;
  return withData.value.has(`${mainId}/${subId}`);
}

export function mainTabShown(mainId: string, subIds: string[]): boolean {
  if (Editor.getInstance().mainTab === mainId) return true;
  return subIds.some(sub => subtabShown(mainId, sub));
}

/** Keep the scan current: on a game, mod or plugin change, and after each save of a tab. */
export function trackTabData() {
  const editor = Editor.getInstance();
  watch([() => editor.selectedGame, () => editor.selectedMod, () => editor.pluginManager.pluginTabs.value],
    () => { withData.value = null; refreshTabData(); }, { immediate: true });
  watch(() => editor.hasUnsavedChanges.value, (now, was) => {
    if (was && !now && editor.secondaryTab) refreshTabData({ main: editor.mainTab, sub: editor.secondaryTab });
  });
}
