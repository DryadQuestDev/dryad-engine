import fs from 'node:fs';
import path from 'node:path';
import type { LintIO } from '../utility/dungeonEditor/lintContext';
import type { ScriptFile } from '../utility/dungeonEditor/scriptVocabulary';
import type { Vocabulary } from '../utility/dungeonEditor/refs';
import { mergeById } from '../functions/mergeById';

/**
 * The content checks' data source read from disk: the same files, layers and plugin data the
 * editor's `editorLintIO` reads, for a game folder outside any running editor.
 */

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function folders(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory() || (d.isSymbolicLink() && fs.statSync(path.join(dir, d.name)).isDirectory()))
      .map(d => d.name);
  } catch {
    return [];
  }
}

function scriptFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      const isDir = e.isDirectory() || (e.isSymbolicLink() && fs.statSync(p).isDirectory());
      if (isDir) walk(p);
      else if (/\.m?js$/i.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** The engine's own vocabulary, exported at engine build time (builtin_vocabulary.json). */
export function loadBuiltins(file: string): Omit<Vocabulary, 'open'> {
  const raw = readJson(file);
  if (!raw) throw new Error(`Missing ${file}: rebuild the tools with npm run build:cli`);
  return {
    actions: new Map(raw.actions), conditions: new Map(raw.conditions), placeholders: new Map(raw.placeholders),
    states: new Map(raw.states), effects: new Map(raw.effects),
  };
}

export function nodeLintIO(assets: string, gameId: string, layer: string, builtins: Omit<Vocabulary, 'open'>): LintIO {
  const gameDir = path.join(assets, 'games_files', gameId);
  // Most specific layer first: a mod's file wins over _core's.
  const layers = layer !== '_core' ? [layer, '_core'] : ['_core'];
  const dungeonFile = (l: string, id: string, file: string) => path.join(gameDir, l, 'dungeons', id, file);

  const plugins = (() => {
    const ids = new Set<string>();
    for (const l of [...layers].reverse()) for (const p of readJson(path.join(gameDir, l, 'manifest.json'))?.plugins ?? []) ids.add(String(p));
    const found: Array<{ id: string; dir: string; json: any }> = [];
    for (const id of ids) {
      // A game or mod copy of a plugin overrides the engine's.
      const dirs = [...layers.map(l => path.join(gameDir, l, 'plugins', id)), path.join(assets, 'engine_files', 'plugins', id)];
      const dir = dirs.find(d => fs.existsSync(path.join(d, 'plugin.json')));
      if (dir) found.push({ id, dir, json: readJson(path.join(dir, 'plugin.json')) ?? {} });
    }
    return found;
  })();

  return {
    loadData: async (file) => {
      if (file === '_dungeons') {
        const ids = new Set<string>();
        for (const l of layers) for (const d of folders(path.join(gameDir, l, 'dungeons'))) ids.add(d);
        return [...ids].map(id => ({ id }));
      }
      // Plugin defaults, then _core, then the mod, merged the way the game merges them: a later
      // entry deep-merges into an earlier one of the same id (a mod adds values to an attribute).
      const lists: any[][] = [];
      for (const p of plugins) {
        const entries = p.json?.data?.[file];
        if (Array.isArray(entries)) lists.push(entries);
      }
      for (const l of [...layers].reverse()) {
        const entries = readJson(path.join(gameDir, l, `${file}.json`));
        if (Array.isArray(entries)) lists.push(entries);
      }
      return mergeById(...lists);
    },
    dungeonIds: async () => {
      const ids = new Set<string>();
      for (const l of layers) for (const d of folders(path.join(gameDir, l, 'dungeons'))) ids.add(d);
      return [...ids];
    },
    dungeonText: async (id) => {
      for (const l of layers) {
        const text = readText(dungeonFile(l, id, 'content_raw.txt'));
        if (text !== null) return text;
      }
      return null;
    },
    dungeonLayerTexts: async (id) => [...layers].reverse()
      .map(l => readText(dungeonFile(l, id, 'content_raw.txt')))
      .filter((t): t is string => !!t),
    dungeonRooms: async (id) => {
      const lists: any[][] = [];
      for (const l of [...layers].reverse()) {
        const rooms = readJson(dungeonFile(l, id, 'rooms.json'));
        if (Array.isArray(rooms)) lists.push(rooms);
      }
      return mergeById(...lists);
    },
    dungeonConfig: async (id) => {
      for (const l of layers) {
        const config = readJson(dungeonFile(l, id, 'config.json'));
        if (config) return config;
      }
      return null;
    },
    scripts: async () => {
      // The enabled plugins' scripts, then the game's and the mod's own.
      const sources: Array<{ dir: string; source: string }> = plugins.map(p => ({ dir: path.join(p.dir, 'scripts'), source: `plugin:${p.id}` }));
      for (const l of [...layers].reverse()) sources.push({ dir: path.join(assets, 'games_assets', gameId, l), source: l === '_core' ? 'game' : `mod:${l}` });
      const files: ScriptFile[] = [];
      for (const { dir, source } of sources) {
        for (const file of scriptFiles(dir)) {
          const text = readText(file);
          if (text) files.push({ path: path.relative(assets, file), text, source });
        }
      }
      return files;
    },
    builtins: async () => builtins,
  };
}
