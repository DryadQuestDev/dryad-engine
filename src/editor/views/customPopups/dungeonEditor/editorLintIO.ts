import { Editor } from '../../../editor';
import { Global } from '../../../../global/global';
import type { LintIO } from '../../../../utility/dungeonEditor/lintContext';
import type { ScriptFile } from '../../../../utility/dungeonEditor/scriptVocabulary';
import { builtinVocabulary } from '../../../../game/utils/builtinVocabulary';

/** The name checks' data source in the editor: merged game data, the game's and its plugins' scripts, and the engine's registrations. */
export function editorLintIO(editor: Editor): LintIO {
  const global = Global.getInstance();
  const game = editor.selectedGame ?? '';
  const mod = editor.selectedMod ?? '_core';
  // Most specific layer first: a mod's file wins over _core's.
  const layers = mod !== '_core' ? [mod, '_core'] : ['_core'];
  const dungeonFile = (layer: string, id: string, file: string) => `games_files/${game}/${layer}/dungeons/${id}/${file}`;
  // pathExists first: a dungeon without rooms.json, or a plugin without scripts, is normal.
  const readJson = async (path: string) => {
    try { return (await global.pathExists(path)) ? await global.readJson(path) : null; } catch { return null; }
  };

  return {
    loadData: (file) => editor.loadFullData(file),
    dungeonIds: async () => (await editor.loadFullData('_dungeons')).map((d: any) => d.id),
    dungeonText: async (id) => {
      for (const layer of layers) {
        const path = dungeonFile(layer, id, 'content_raw.txt');
        try {
          if (!await global.pathExists(path)) continue;
          const text = await global.readText(path);
          if (text !== null && text !== undefined) return text;
        } catch { /* not in this layer */ }
      }
      return null;
    },
    dungeonLayerTexts: async (id) => {
      const texts: string[] = [];
      for (const layer of [...layers].reverse()) {
        const path = dungeonFile(layer, id, 'content_raw.txt');
        try {
          if (!await global.pathExists(path)) continue;
          const text = await global.readText(path);
          if (text) texts.push(text);
        } catch { /* not in this layer */ }
      }
      return texts;
    },
    dungeonRooms: async (id) => {
      const byId = new Map<string, any>();
      for (const layer of [...layers].reverse()) {
        const rooms = await readJson(dungeonFile(layer, id, 'rooms.json'));
        if (Array.isArray(rooms)) for (const r of rooms) if (r?.id !== undefined) byId.set(String(r.id), r);
      }
      return [...byId.values()];
    },
    dungeonConfig: async (id) => {
      for (const layer of layers) {
        const config = await readJson(dungeonFile(layer, id, 'config.json'));
        if (config) return config;
      }
      return null;
    },
    scripts: async () => {
      // The enabled plugins' scripts, then the game's and the mod's own.
      const folders: Array<{ dir: string; source: string }> = [];
      for (const plugin of editor.pluginManager.plugins.value) {
        const path = await editor.pluginManager.resolvePluginPath(plugin.id).catch(() => null);
        if (path) folders.push({ dir: `${path}/scripts`, source: `plugin:${plugin.id}` });
      }
      for (const layer of [...layers].reverse()) folders.push({ dir: `games_assets/${game}/${layer}`, source: layer === '_core' ? 'game' : `mod:${layer}` });
      // Read in parallel, kept in folder order: a later registration overrides an earlier one.
      const perFolder = await Promise.all(folders.map(async ({ dir, source }) => {
        if (!await global.pathExists(dir).catch(() => false)) return [];
        const files = await global.listFilesRecursively(dir).catch(() => [] as string[]);
        const read = await Promise.all(files.filter((f) => /\.m?js$/i.test(f)).sort().map(async (path): Promise<ScriptFile | null> => {
          try {
            const text = await global.readText(path);
            return text ? { path, text, source } : null;
          } catch {
            return null;   // unreadable script: its names stay unknown
          }
        }));
        return read.filter((f): f is ScriptFile => f !== null);
      }));
      return perFolder.flat();
    },
    builtins: async () => builtinVocabulary(),
  };
}
