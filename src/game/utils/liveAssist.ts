import type { Game } from '../game';
import { builtinVocabulary } from './builtinVocabulary';
import { indexParsedDungeon, type DungeonIndex, type LintContext, type Vocabulary } from '../../utility/dungeonEditor/refs';
import { addCharacter, loadVocabData } from '../../utility/dungeonEditor/lintContext';
import type { AssistMode, AssistPlace } from '../../utility/dungeonEditor/assist';

export type LiveAssist = {
  /** Where the player is now, as a place to complete in. */
  place(mode: AssistMode): AssistPlace;
  /** Pick up flags and characters the game has made since. */
  refresh(): void;
};

const EMPTY_INDEX: DungeonIndex = {
  rooms: new Set(), scenesByRoom: new Map(), anchors: new Set(), templates: new Set(),
  flagWrites: new Set(), scopedFlagWrites: new Map(), createdCharacters: new Set(),
};

/**
 * Completion and hover over the running game: its live registrations, its loaded data and its
 * dungeons' parsed lines, plus the flags and characters it holds. Indexing every dungeon is the
 * slow part, so it happens once.
 */
export async function liveAssist(game: Game): Promise<LiveAssist> {
  const vocab = liveVocabulary(game);
  const data = await loadVocabData(vocab, async (file) => {
    const d = game.coreSystem.dataRegistry.get(file) as unknown;
    return d instanceof Map ? [...d.values()] : Array.isArray(d) ? d : [];
  });

  const ds = game.dungeonSystem;
  const dungeons = new Map<string, DungeonIndex>();
  for (const [id, lines] of ds.dungeonLines) {
    const index = indexParsedDungeon(lines.values(), [...(ds.dungeonRooms.get(id)?.keys() ?? [])].map(String));
    for (const c of index.createdCharacters) addCharacter(data, c, `dungeon ${id}`);
    dungeons.set(id, index);
  }

  function refresh() {
    for (const [id, d] of ds.dungeonDatas.value) {
      const index = dungeons.get(id);
      if (index) for (const flag of d.flags.keys()) index.flagWrites.add(flag);
    }
    for (const c of game.getAllCharacters()) addCharacter(data, c.id, 'the game');
  }
  refresh();

  // The checks' context leaves out the dungeon being worked in: rebuilt when the player moves on.
  let lint: LintContext | null = null;
  return {
    place(mode) {
      const current = ds.currentDungeonId.value ?? '';
      if (lint?.dungeonId !== current) {
        const others = new Map(dungeons);
        others.delete(current);
        lint = { dungeonId: current, ...data, dungeons: others, scriptFlags: new Set(), vocab };
      }
      return {
        mode,
        scope: { kind: null, room: ds.currentRoomId.value, inTemplate: false, unfinished: false, ignore: new Set() },
        lint,
        self: dungeons.get(current) ?? EMPTY_INDEX,
      };
    },
    refresh,
  };
}

/** What the game has registered, with the help and values each registration carries. */
function liveVocabulary(game: Game): Vocabulary {
  const builtin = builtinVocabulary();
  const ls = game.logicSystem;
  // A live registry does not say who registered a name: the engine's own, or a script's.
  const source = (names: Map<string, unknown>, id: string) => ({ source: names.has(id) ? 'builtin' : 'script' });
  return {
    actions: new Map([...ls.actionRegistry].map(([id, a]) => [id, { ...source(builtin.actions, id), help: a.help, value: a.value, examples: a.examples }])),
    conditions: new Map([...ls.conditionRegistry.keys()].map((id) => [id, { ...source(builtin.conditions, id), ...ls.conditionInfo.get(id) }])),
    placeholders: new Map([...ls.placeholderRegistry.keys()].map((id) => [id, { ...source(builtin.placeholders, id), ...ls.placeholderInfo.get(id) }])),
    states: new Map([...game.coreSystem.state.value.keys()].map((id) => [id, source(builtin.states, id)])),
    effects: new Map([...ls.textEffectRegistry.keys()].map((id) => [id, source(builtin.effects, id)])),
    open: new Set(),
  };
}
