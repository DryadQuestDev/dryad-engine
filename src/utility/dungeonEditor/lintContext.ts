import { parseToAst } from './parseToAst';
import { indexDungeon, refsOf, type DungeonIndex, type EntryInfo, type LintContext, type Vocabulary } from './refs';
import { readScripts, type ScriptFile, type ScriptVocabulary } from './scriptVocabulary';
import { CHOICE_KEYS, DATA_KEYS, HEADER_KEYS } from '../contentVocabulary';

/**
 * Where the name checks get their data. The editor implements it with its merged loaders
 * (plugin data, then _core, then the selected mod); tools can implement it over the filesystem.
 */
export type LintIO = {
  /** A game data file merged across plugins and layers, e.g. 'assets'. */
  loadData(file: string): Promise<any[]>;
  dungeonIds(): Promise<string[]>;
  /** The dungeon's `content_raw.txt`, from the most specific layer that has one. */
  dungeonText(id: string): Promise<string | null>;
  /**
   * Every layer's `content_raw.txt` for the dungeon, `_core` first. A mod's file only overlays
   * `_core`'s (the game merges them line by line), so its names are the union. Defaults to
   * `dungeonText` alone.
   */
  dungeonLayerTexts?(id: string): Promise<string[]>;
  /** The dungeon's merged `rooms.json` entries. */
  dungeonRooms(id: string): Promise<any[]>;
  /** The dungeon's `config.json`, if any. */
  dungeonConfig(id: string): Promise<Record<string, any> | null>;
  /** The scripts the game loads: its own and its enabled plugins'. */
  scripts(): Promise<ScriptFile[]>;
  /** What the engine registers itself (InitSystem's registrations). */
  builtins(): Promise<Omit<Vocabulary, 'open'>>;
};

export type BuiltLintContext = {
  ctx: LintContext;
  /** Every dungeon's raw text, for checking the whole game. */
  texts: Map<string, string>;
  /** What the scripts register, with where; for listing names by source. */
  scripts: ScriptVocabulary;
};

/** Data files every check needs, whatever the descriptions name: lore links and speakers. */
const ALWAYS = ['character_templates', 'character_skin_layers', 'records', 'item_templates', 'character_statuses'];

/** Build what the name checks need for `dungeonId`: the vocabulary, every id list, and an index of every dungeon. */
export async function buildLintContext(io: LintIO, dungeonId: string): Promise<BuiltLintContext> {
  const [builtins, files] = await Promise.all([io.builtins(), io.scripts().catch(() => [] as ScriptFile[])]);
  const scripts = readScripts(files);

  // A script's registration replaces a built-in of the same name, as it does at runtime.
  const vocab: Vocabulary = {
    actions: new Map([...builtins.actions, ...scripts.actions]),
    conditions: new Map([...builtins.conditions, ...scripts.conditions]),
    placeholders: new Map([...builtins.placeholders, ...scripts.placeholders]),
    states: new Map([...builtins.states, ...scripts.states]),
    effects: new Map([...builtins.effects, ...scripts.effects]),
    open: scripts.open,
  };

  const data = await loadVocabData(vocab, io.loadData);
  for (const id of scripts.characters) addCharacter(data, id, 'a script');

  const built: BuiltLintContext = {
    ctx: { dungeonId, ...data, dungeons: new Map(), scriptFlags: scripts.flags, vocab }, texts: new Map(), scripts,
  };
  await refreshDungeons(io, built, await io.dungeonIds().catch(() => [] as string[]));
  return built;
}

/**
 * Read these dungeons again into a built context: their text, rooms and config, as they are on
 * disk now. Cheaper than a rebuild when only they can have changed (the one just saved).
 */
export async function refreshDungeons(io: LintIO, built: BuiltLintContext, ids: string[]): Promise<void> {
  const { ctx, texts } = built;
  await Promise.all(ids.map(async (id) => {
    const [text, layerTexts, rooms, config] = await Promise.all([
      io.dungeonText(id).catch(() => null),
      io.dungeonLayerTexts ? io.dungeonLayerTexts(id).catch(() => null) : Promise.resolve(null),
      io.dungeonRooms(id).catch(() => [] as any[]), io.dungeonConfig(id).catch(() => null),
    ]);
    const roomIds = rooms.map((r) => r?.id).filter((r) => r !== undefined && r !== null).map(String);
    // A screen dungeon without rooms plays in one implicit room.
    if (config?.dungeon_type === 'screen' && !roomIds.length) roomIds.push('main');
    const index = indexDungeon(parseToAst(layerTexts?.length ? layerTexts.join('\n') : text ?? ''), roomIds);
    for (const c of index.createdCharacters) addCharacter(ctx, c, `dungeon ${id}`);
    ctx.dungeons.set(id, index);
    if (text !== null) texts.set(id, text);
    else texts.delete(id);
  }));
}

export type VocabData = Pick<LintContext, 'ids' | 'info' | 'attributes'>;

/**
 * Every id list the vocabulary's descriptions name, with each id's display info, and the
 * characters content can use: templates and their instances.
 */
export async function loadVocabData(vocab: Vocabulary, loadData: LintIO['loadData']): Promise<VocabData> {
  const needed = new Set(ALWAYS);
  for (const a of vocab.actions.values()) refsOf(a.value, needed);
  for (const e of [...vocab.conditions.values(), ...vocab.placeholders.values()]) for (const arg of e.args ?? []) refsOf(arg, needed);
  for (const keys of [CHOICE_KEYS, DATA_KEYS, ...Object.values(HEADER_KEYS)]) for (const k of Object.values(keys)) refsOf(k.value, needed);

  const ids = new Map<string, Set<string>>();
  const info = new Map<string, Map<string, EntryInfo>>();
  const dataFiles = [...needed];
  const lists = await Promise.all(dataFiles.map((file) => loadData(file).catch(() => null)));
  dataFiles.forEach((file, i) => {
    const list = lists[i];
    if (!Array.isArray(list)) return;
    ids.set(file, new Set(list.map((e) => e?.id).filter(Boolean).map(String)));
    info.set(file, new Map(list.filter((e) => e?.id).map((e) => [String(e.id), entryInfo(e)])));
  });

  const templates = lists[dataFiles.indexOf('character_templates')] ?? [];
  const creatable = new Set<string>(ids.get('character_templates') ?? []);
  const characterInfo = new Map<string, EntryInfo>(info.get('character_templates') ?? []);
  for (const t of templates) {
    for (const inst of t?.instances || []) {
      if (!inst?.id) continue;
      creatable.add(String(inst.id));
      const base = characterInfo.get(String(t.id)) ?? {};
      const own = entryInfo(inst);
      characterInfo.set(String(inst.id), { name: own.name ?? base.name, image: own.image ?? base.image, template: String(t.id) });
    }
  }
  ids.set('character_template', creatable);
  info.set('character_template', characterInfo);
  ids.set('character', new Set(creatable));
  info.set('character', characterInfo);

  const attributes = new Map<string, string[]>();
  for (const a of await loadData('character_attributes').catch(() => [] as any[])) {
    if (a?.id) attributes.set(a.id, Array.isArray(a.values) ? a.values.map(String) : []);
  }
  return { ids, info, attributes };
}

/** A character id content can use without a template of that name: a script or `{create_character}` makes it. */
export function addCharacter(data: VocabData, id: string, source: string) {
  data.ids.get('character')!.add(id);
  const info = data.info.get('character')!;
  if (!info.has(id)) info.set(id, { source });
}

const IMAGE_FILE = /\.(webp|png|jpe?g|gif|avif)$/i;

/** A data entry's display name and picture, whichever fields its file uses. */
function entryInfo(e: any): EntryInfo {
  const name = e.name ?? e.traits?.name ?? e.title ?? e.gallery?.entity_name;
  const image = [e.file_image, e.traits?.face_static, e.traits?.image, e.image].find((x) => typeof x === 'string' && IMAGE_FILE.test(x));
  return { ...(typeof name === 'string' && name ? { name } : {}), ...(image ? { image } : {}) };
}

/** The same context, pointed at another dungeon of the game (for checking the whole game). */
export function forDungeon(ctx: LintContext, dungeonId: string): LintContext {
  return { ...ctx, dungeonId };
}
