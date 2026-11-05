import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLintContext, forDungeon } from '../utility/dungeonEditor/lintContext';
import { lintDungeonContent } from '../utility/dungeonEditor/lint';
import { parseToAst } from '../utility/dungeonEditor/parseToAst';
import { buildContentParsed, sourceHash } from '../utility/contentParsed';
import { loadBuiltins, nodeLintIO } from './nodeLintIO';
import { imageSize } from './imageSize';

/**
 * Dryad Engine's command-line tools, built into engine_files/tools/dryad.mjs (npm run build:cli)
 * so a game's writers – people or AI agents – can check content without opening the engine.
 */

const HELP = `Dryad Engine tools (Node 18+)

  node engine_files/tools/dryad.mjs check <game> [dungeon...] [--mod <id>]
      Runs the editor's content checks: unknown actions, conditions and ids, flags
      read but never set, broken syntax. Prints file:line: severity: message and
      exits with 1 when there are errors.

  node engine_files/tools/dryad.mjs parse <game> [dungeon...] [--mod <id>] [--all]
      Regenerates content_parsed.json for each dungeon whose content_raw.txt or
      config.json changed. The engine also does this when a dev playtest starts,
      when the editor opens the game, and on Export.

Options:
  --mod <id>      a mod's layer instead of _core (checked on top of _core)
  --all           parse every dungeon, not only the changed ones
  --assets <dir>  the engine's assets folder (default: the one this file is in)
`;

type Args = { command: string; game: string; dungeons: string[]; mod: string | null; all: boolean; assets: string };

function parseArgs(argv: string[]): Args | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args: Args = { command: '', game: '', dungeons: [], mod: null, all: false, assets: path.resolve(here, '..', '..') };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mod') args.mod = argv[++i] ?? null;
    else if (a === '--assets') args.assets = path.resolve(argv[++i] ?? '.');
    else if (a === '--all') args.all = true;
    else if (a === '--help' || a === '-h') return null;
    else rest.push(a);
  }
  [args.command = '', args.game = '', ...args.dungeons] = rest;
  return args.command && args.game ? args : null;
}

const read = (file: string): string | null => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

async function check(args: Args): Promise<number> {
  const layer = args.mod ?? '_core';
  // Shipped beside this file, which may be run against another assets folder.
  const builtins = loadBuiltins(path.join(path.dirname(fileURLToPath(import.meta.url)), 'builtin_vocabulary.json'));
  const io = nodeLintIO(args.assets, args.game, layer, builtins);
  const all = await io.dungeonIds();
  const layerDir = (l: string, id: string) => path.join(args.assets, 'games_files', args.game, l, 'dungeons', id);
  // With a mod, its own dungeons; _core's are checked without --mod.
  let targets = args.mod ? all.filter(id => fs.existsSync(path.join(layerDir(args.mod!, id), 'content_raw.txt'))) : all;
  if (args.dungeons.length) {
    const unknown = args.dungeons.filter(d => !all.includes(d));
    if (unknown.length) {
      console.error(`No dungeon ${unknown.map(d => `'${d}'`).join(', ')} in ${args.game}/${layer}`);
      return 2;
    }
    targets = args.dungeons;
  }

  const { ctx, texts } = await buildLintContext(io, targets[0] ?? all[0] ?? '');
  let errors = 0;
  let warnings = 0;
  for (const id of targets.sort()) {
    const text = texts.get(id);
    if (text === undefined) continue;
    const fileLayer = args.mod && fs.existsSync(path.join(layerDir(args.mod, id), 'content_raw.txt')) ? args.mod : '_core';
    const file = path.relative(process.cwd(), path.join(layerDir(fileLayer, id), 'content_raw.txt'));
    for (const issue of lintDungeonContent(text, parseToAst(text), forDungeon(ctx, id))) {
      if (issue.ignored) continue;
      if (issue.severity === 'error') errors++;
      else warnings++;
      // The editor's one-click fixes, as hints: an AI writer applies them by hand.
      const fixes = issue.fixes?.length ? ` (did you mean ${issue.fixes.map(f => `'${f.text}'`).join(' or ')}?)` : '';
      console.log(`${file}:${issue.line}: ${issue.severity}: ${issue.message}${fixes}`);
    }
  }
  const dungeons = `${targets.length} ${targets.length === 1 ? 'dungeon' : 'dungeons'}`;
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  console.log(errors || warnings ? `${count(errors, 'error')}, ${count(warnings, 'warning')} in ${dungeons}` : `No problems in ${dungeons}`);
  return errors ? 1 : 0;
}

function parse(args: Args): number {
  const gameDir = path.join(args.assets, 'games_files', args.game);
  const layers = args.mod ? [args.mod]
    : fs.readdirSync(gameDir).filter(l => fs.existsSync(path.join(gameDir, l, 'manifest.json')));
  let written = 0;
  let fresh = 0;
  for (const layer of layers) {
    const dungeonsDir = path.join(gameDir, layer, 'dungeons');
    if (!fs.existsSync(dungeonsDir)) continue;
    const ids = args.dungeons.length ? args.dungeons : fs.readdirSync(dungeonsDir);
    for (const id of ids) {
      const dir = path.join(dungeonsDir, id);
      const raw = read(path.join(dir, 'content_raw.txt'));
      if (raw === null) continue;
      const configText = read(path.join(dir, 'config.json'));
      const hash = sourceHash(raw, configText ?? '');
      const parsedFile = path.join(dir, 'content_parsed.json');
      let stored: string | undefined;
      try {
        stored = JSON.parse(read(parsedFile) ?? 'null')?.find?.((l: any) => l?.id === '_config_')?.source?.hash;
      } catch { /* unreadable: regenerate */ }
      if (stored === hash && !args.all) {
        fresh++;
        continue;
      }
      let config: Record<string, any> = {};
      try {
        config = configText ? JSON.parse(configText) : {};
      } catch { /* a broken config parses as none */ }
      let mapSize = null;
      if (config.dungeon_type !== 'text' && typeof config.image === 'string') {
        mapSize = imageSize(path.join(args.assets, config.image.replace(/^\/?assets\//, '')));
        if (!mapSize) console.warn(`${id}: image not found or unreadable: ${config.image}`);
      }
      fs.writeFileSync(parsedFile, JSON.stringify(buildContentParsed(raw, config, mapSize, { hash }), null, 2), 'utf8');
      console.log(`regenerated ${path.relative(process.cwd(), parsedFile)}`);
      written++;
    }
  }
  console.log(`${written} regenerated, ${fresh} already up to date`);
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args || !['check', 'parse'].includes(args.command)) {
    console.log(HELP);
    return args ? 2 : 0;
  }
  if (!fs.existsSync(path.join(args.assets, 'games_files', args.game))) {
    console.error(`No game '${args.game}' in ${path.join(args.assets, 'games_files')}`);
    return 2;
  }
  return args.command === 'check' ? check(args) : parse(args);
}

main().then((code) => process.exit(code), (error) => {
  console.error(error);
  process.exit(2);
});
