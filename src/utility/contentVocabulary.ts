import { RAW_FLASH_PRESETS, RAW_GRADE_PRESETS } from './sceneGradePresets';

/**
 * What content can say that no registration describes, and the shape of the descriptions that
 * registrations carry. Every action, condition and placeholder describes itself on its own
 * registerAction / registerCondition / registerPlaceholder call (`help`, `value`, `args`); the
 * dungeon editor checks, completes and explains content from those. This module holds the rest:
 * the value types, the keys the engine reads off choices and block headers, and fixed name lists.
 */

// ---------------------------------------------------------------------------------------------
// Value descriptions
// ---------------------------------------------------------------------------------------------

/**
 * A value with no parts:
 * - `any` — not checked
 * - `text` — shown to the player
 * - `number`, `boolean`
 * - `condition` — `flag = 1, _cond(x) > 2` (the condition grammar)
 * - `scene` — a scene id, `&anchor`, `next` or `shift:N`
 */
export type ValueWord = 'any' | 'text' | 'number' | 'boolean' | 'condition' | 'scene';

/**
 * An id. `ref` names where it lives: a game data file (`assets`, `item_templates`,
 * `character_statuses`, …), or one of:
 * - `character` — a character id (templates, their instances, created ones)
 * - `character_template` — a template or instance id a character can be created from
 * - `room` — `room` in this dungeon, or `dungeon.room`
 * - `dungeon`, `flag`, `state`, `quest_log` (`quest.goal.log`, or `dungeon.quest.goal.log`)
 * - `attribute` — an attribute id (its values follow) or a skin layer (true / false)
 * - a built-in list: `grade_presets`, `flash_presets`, `ambient_kinds`, `actor_animations`
 */
export type RefSpec = {
  ref: string;
  /** How messages name the id ("Battle"); defaults to the data file's name. */
  label?: string;
  /** Words accepted in place of an id, e.g. `false`, `clear`. */
  words?: string[];
  /** A leading `!` (remove / stop) is allowed; the id after it is checked. */
  remove?: boolean;
  /** A leading `!` stops it; what follows is not an id. */
  stop?: boolean;
  /** A literal the id must start with, e.g. `^` for a pool. */
  prefix?: string;
  /** A `#N` count, level or strength may follow the id. */
  count?: boolean;
  /** A `(key = value, …)` tail may follow; a list names its keys, so others are reported. */
  props?: true | string[];
  /** A value with a `/` is a file path, not an id. */
  paths?: boolean;
  /** Only the part before the first `.` is the id (`gold.max`, `alice.stat.brawn`). */
  root?: boolean;
  /** An unknown id stops the game with an error, rather than skipping a step. */
  fatal?: boolean;
  /** An unknown id is fine when the `(…)` tail sets one of these keys: the runtime makes one. */
  newWith?: string[];
};

/** One of these words, and nothing else: `right`, `left` or `both`. */
export type WordsSpec = { words: string[] };

/**
 * Comma-separated values (commas inside `(…)` and `[…]` stay with their part). `prefix` is a
 * literal the whole list starts with, e.g. `^` before a list of pools.
 */
export type ListSpec = { list: ValueSpec; words?: string[]; prefix?: string };

/** `left->right`, or `left right` with `sep: ' '`. */
export type PairSpec = { pair: [ValueSpec, ValueSpec]; sep?: string; optional?: boolean };

/**
 * Comma-separated `target.key = value` specs (`=`, `+=`, `-=`).
 * - `target` — the part before the first dot; omit when the key stands alone (`flag`)
 * - `key` — the key; or `typed`, when a middle word picks the kind (`alice.stat.brawn`)
 * - `value` — `of` takes the values the key lists (an attribute's values)
 */
export type OpsSpec = {
  ops: {
    target?: ValueSpec;
    key?: ValueSpec;
    typed?: Record<string, ValueSpec>;
    value?: ValueSpec | 'of';
  };
};

/**
 * `target->item & !item, target->item` groups. `bareRemove` also takes a lone `!target`
 * (clears everything of that target).
 */
export type TargetedSpec = { targeted: ValueSpec; target?: ValueSpec; bareRemove?: boolean };

/** One of several forms: a string, an object, a number or a boolean each pick their own. */
export type OneOfSpec = { oneOf: ValueSpec[] };

/** The object form `{key: …}`: the listed keys are checked, others pass. */
export type FieldsSpec = { fields: Record<string, ValueSpec> };

export type ValueSpec = ValueWord | RefSpec | WordsSpec | ListSpec | PairSpec | OpsSpec | TargetedSpec | OneOfSpec | FieldsSpec;

/** What the editor knows about one name: a help line, examples, and for an action or key its value. */
export type VocabEntry = { help?: string; value?: ValueSpec; examples?: string[] };

/** A condition or placeholder: a help line, what each `(…)` argument is, and examples. */
export type CallEntry = { help?: string; args?: ValueSpec[]; examples?: string[] };

// ---------------------------------------------------------------------------------------------
// Built-in lists
// ---------------------------------------------------------------------------------------------

/** Ambient particle kinds drawn over the scene backgrounds by SceneAmbient. */
export const AMBIENT_KINDS = ['fireflies', 'motes', 'embers'] as const;

/** One-shot actor animations (`anim=` / {animate}). Everything else is a looping idle. */
export const ONE_SHOT_ANIMS = ['lunge', 'recoil', 'hurt', 'hop', 'shake', 'shiver', 'nod', 'bounce', 'flash'];

/** The named lists a `ref` can point at besides game data. */
export const BUILTIN_LISTS: Record<string, readonly string[]> = {
  grade_presets: Object.keys(RAW_GRADE_PRESETS),
  flash_presets: [...Object.keys(RAW_FLASH_PRESETS), ...Object.keys(RAW_GRADE_PRESETS)],
  ambient_kinds: AMBIENT_KINDS,
  actor_animations: ONE_SHOT_ANIMS,
};

// ---------------------------------------------------------------------------------------------
// Keys that are read, not dispatched
// ---------------------------------------------------------------------------------------------

/**
 * Keys of a choice's params that configure the choice instead of acting: resolveActions skips
 * them, so they are legal in any action object.
 */
export const CHOICE_KEYS: Record<string, VocabEntry> = {
  if: { help: 'Show the choice only while the condition holds.', value: 'condition' },
  ifOr: { help: 'Show the choice while any clause holds.', value: 'condition' },
  active: { help: 'Show the choice, greyed out unless the condition holds.', value: 'condition' },
  activeOr: { help: 'Grey the choice out unless any clause holds.', value: 'condition' },
  clue: { help: 'Highlight the choice until the player takes it.', value: 'boolean' },
  no_visited: { help: 'Never mark the choice visited.', value: 'boolean' },
  ignore_replay: { help: 'Skip this menu in a gallery replay.', value: 'boolean' },
};

/** Keys the content parser or the editor reads before any action runs. */
export const DATA_KEYS: Record<string, VocabEntry> = {
  title: { help: 'Beside a "^pool" loot or trade: that placement\'s inventory name.', value: 'text' },
  __meta: { help: 'Editor notes; the game never sees them.', value: 'any' },
};

/** What a block header's `{…}` takes, per block kind. Header keys are data, never actions. */
export const HEADER_KEYS: Record<'room' | 'encounter' | 'scene' | 'template', Record<string, VocabEntry>> = {
  room: {
    __meta: DATA_KEYS.__meta,
  },
  encounter: {
    if: { help: 'Show the encounter only while the condition holds.', value: 'condition' },
    ifOr: { help: 'Show the encounter while any clause holds.', value: 'condition' },
    rooms: { help: 'Also place the encounter in these rooms.', value: { list: { ref: 'room' } } },
    discover: { help: 'Hide the encounter until the party meets a stat: "perception#6".', value: { ref: 'character_stats', count: true } },
    title: { help: 'The label a spot encounter shows on the map.', value: 'text' },
    __meta: DATA_KEYS.__meta,
  },
  scene: {
    if: { help: 'Play the scene as a room event when the condition holds.', value: 'condition' },
    ifOr: { help: 'Play the scene as a room event when any clause holds.', value: 'condition' },
    rooms: { help: 'The event also fires in these rooms.', value: { list: { ref: 'room' } } },
    repeat: { help: 'The event can fire again.', value: 'boolean' },
    intro: { help: 'Play block 1 on the first visit, block 2 after.', value: 'boolean' },
    view: { help: 'List the scene in the gallery under this name.', value: 'text' },
    replay: { help: 'Actions that set the stage when the scene is replayed from the gallery.', value: 'any' },
    __meta: DATA_KEYS.__meta,
  },
  template: {
    if: { help: 'Use this variant only while the condition holds.', value: 'condition' },
    ifOr: { help: 'Use this variant while any clause holds.', value: 'condition' },
    progress: { help: 'Quest log entry: 1 completes the goal, 2 the quest.', value: 'number' },
    __meta: DATA_KEYS.__meta,
  },
};
