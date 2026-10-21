import type { Block, Document } from './ast';
import { stripCodeBlocks, stripCommentLinesMapped } from './comments';
import { readMeta } from './meta';
import { splitOps, splitParts, splitProps, splitTargeted, type Piece } from '../contentGrammar';
import {
  BUILTIN_LISTS, CHOICE_KEYS, DATA_KEYS, HEADER_KEYS,
  type CallEntry, type OpsSpec, type RefSpec, type ValueSpec, type VocabEntry,
} from '../contentVocabulary';
import { RESERVED_TEXT_TAGS, TEXT_EFFECT_NAME_REGEX } from '../textTags';
import type { NameKind } from './scriptVocabulary';

/**
 * Content checks driven by what registrations say about themselves: every action's `value`, every
 * condition's and placeholder's `args`, the keys choices and block headers take. The checks know
 * the shapes (ValueSpec), never a particular action; an action without a `value` is not checked.
 *
 * Shared grammars come from contentGrammar.ts, the same functions the runtime parses with. The
 * scene, flag, condition, lore-link and speaker checks mirror DungeonSystem.resolveSceneId, the
 * condition evaluator, resolveLoreLinks and resolveTalkingCharacter.
 */

/** What one dungeon offers to references from anywhere. */
export type DungeonIndex = {
  /** Room ids: rooms.json, the content's `^room` blocks, and `main` for a screen dungeon. */
  rooms: Set<string>;
  /** Scene ids (`#id` blocks) per content room. */
  scenesByRoom: Map<string, Set<string>>;
  /** `&name` anchors of the dungeon's scenes. */
  anchors: Set<string>;
  /** `$id` template blocks. */
  templates: Set<string>;
  /** Flags a `{flag}` in this dungeon's content writes into this dungeon. */
  flagWrites: Set<string>;
  /** `{flag: "other.x = 1"}` writes, by the dungeon they land in. */
  scopedFlagWrites: Map<string, Set<string>>;
  /** Character ids a `{create_character}` creates. */
  createdCharacters: Set<string>;
};

/** A registered name and where it comes from. */
export type NameInfo = { source: string; file?: string; line?: number };

/** Every name content can use, with what each registration says about itself. */
export type Vocabulary = {
  actions: Map<string, NameInfo & VocabEntry>;
  conditions: Map<string, NameInfo & CallEntry>;
  placeholders: Map<string, NameInfo & CallEntry>;
  states: Map<string, NameInfo>;
  effects: Map<string, NameInfo>;
  /** Kinds some script registers under a name the editor cannot read: their names are not checked. */
  open: Set<NameKind>;
};

/** What the editor shows for one id: its display name, a picture, and for an instance its template. */
export type EntryInfo = { name?: string; image?: string; template?: string; source?: string };

export type LintContext = {
  /** The dungeon being checked. */
  dungeonId: string;
  /** Ids by where they live: a data file name (`assets`), `character` or `character_template`. */
  ids: Map<string, Set<string>>;
  /** Display info per id, by the same keys as `ids`. */
  info: Map<string, Map<string, EntryInfo>>;
  /** Attribute id → its values (an empty list accepts any value). */
  attributes: Map<string, string[]>;
  /** Every dungeon of the game except the one being checked, which is indexed live from its document. */
  dungeons: Map<string, DungeonIndex>;
  /** Flags a script sets by name (`game.setFlag('x', …)`): the editor cannot tell where they land. */
  scriptFlags: Set<string>;
  vocab: Vocabulary;
};

export type RefFix = { label: string; start: number; end: number; text: string };

export type RefIssue = {
  severity: 'error' | 'warning';
  message: string;
  start: number;
  end: number;
  fixes?: RefFix[];
  /** `kind:value` — what "Ignore here" stores in the block's `__meta`. */
  ignoreKey?: string;
  /** The block ignores this one: kept so the editor can list what is ignored. */
  ignored?: boolean;
};

// ---------------------------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------------------------

/** Index a dungeon document: its rooms, scenes, anchors, templates, flag writes, created characters. */
export function indexDungeon(doc: Document, extraRooms: Iterable<string> = []): DungeonIndex {
  const index: DungeonIndex = {
    rooms: new Set(extraRooms), scenesByRoom: new Map(), anchors: new Set(), templates: new Set(),
    flagWrites: new Set(), scopedFlagWrites: new Map(), createdCharacters: new Set(),
  };
  let room: string | null = null;
  for (const block of doc.blocks) {
    if (!block) continue;
    if (block.kind === 'room') {
      room = block.id;
      index.rooms.add(block.id);
      if (!index.scenesByRoom.has(block.id)) index.scenesByRoom.set(block.id, new Set());
      continue;
    }
    if (block.kind === 'scene' && room !== null) index.scenesByRoom.get(room)!.add(block.id);
    if (block.kind === 'template') index.templates.add(block.id);
    for (const text of blockTexts(block)) scanWrites(text, index);
  }
  return index;
}

/** A dungeon line as a running game holds it (content_parsed). */
export type ParsedLine = { id: string; val?: unknown; params?: unknown; anchor?: string };

/**
 * The same index from a dungeon's parsed lines, which is all a running game holds. A line's id
 * starts with its block's sigil and room (`#room.scene.…`, `@room.encounter`); a template is one
 * line whose id is the template's (`$quest.main.1`).
 */
export function indexParsedDungeon(lines: Iterable<ParsedLine>, extraRooms: Iterable<string> = []): DungeonIndex {
  const index: DungeonIndex = {
    rooms: new Set(extraRooms), scenesByRoom: new Map(), anchors: new Set(), templates: new Set(),
    flagWrites: new Set(), scopedFlagWrites: new Map(), createdCharacters: new Set(),
  };
  for (const line of lines) {
    const id = String(line?.id ?? '');
    const [head, second] = id.slice(1).split('.', 2);
    if (id[0] === '$') index.templates.add(id.slice(1));
    else if (head && '@#!~>'.includes(id[0])) {
      index.rooms.add(head);
      if (!index.scenesByRoom.has(head)) index.scenesByRoom.set(head, new Set());
      if (id[0] === '#' && second) index.scenesByRoom.get(head)!.add(second);
    }
    if (line.anchor) index.anchors.add(line.anchor);
    if (typeof line.val === 'string' && line.val.includes('{')) scanWrites(line.val, index);
    if (line.params && typeof line.params === 'object') scanWrites(JSON.stringify(line.params), index);
  }
  return index;
}

/** Every text of a block that can carry actions or anchors: params and content. */
function blockTexts(block: Block): string[] {
  const out: string[] = [];
  if ('paramsRaw' in block && block.paramsRaw) out.push(block.paramsRaw);
  if (block.kind === 'raw') out.push(block.text);
  if (block.kind === 'encounter' || block.kind === 'template') {
    for (const row of block.rows) {
      if (row.kind === 'choice' && row.paramsRaw) out.push(row.paramsRaw);
      if (row.kind === 'text' || row.kind === 'code' || row.kind === 'raw') out.push(row.text);
    }
  }
  if (block.kind === 'scene') {
    for (const row of block.rows) for (const col of row.columns) {
      if (col.paramsRaw) out.push(col.paramsRaw);
      if (col.content) out.push(col.content);
    }
  }
  return out;
}

function scanWrites(text: string, index: DungeonIndex) {
  const live = stripCodeBlocks(stripCommentLinesMapped(text).text);
  for (const m of live.matchAll(/^&(\w+)/gm)) index.anchors.add(m[1]);
  for (const [s, e] of findBraces(live)) {
    if (isConditionAt(live, s)) continue;
    for (const entry of scanObject(live, s, e)) {
      if (entry.key === 'flag' && entry.kind === 'string') {
        for (const op of splitOps(entry.value)) {
          if (!op.id) continue;
          const id = op.id.text;
          const dot = id.indexOf('.');
          if (dot === -1) index.flagWrites.add(id);
          else {
            const d = id.slice(0, dot);
            if (!index.scopedFlagWrites.has(d)) index.scopedFlagWrites.set(d, new Set());
            index.scopedFlagWrites.get(d)!.add(id.slice(dot + 1));
          }
        }
      } else if (entry.key === 'create_character') {
        // A string list, one { id, template } object, or an array of either.
        const values = entry.kind === 'array' ? scanArray(live, entry.start, entry.end) : [entry];
        for (const v of values) {
          if (v.kind === 'string') {
            for (const p of splitParts(v.value)) if (p.text) index.createdCharacters.add(p.text);
          } else if (v.kind === 'object') {
            for (const inner of scanObject(live, v.start - 1, v.end + 1)) {
              if (inner.key === 'id' && inner.kind === 'string') index.createdCharacters.add(inner.value);
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Lexing helpers (same-length quote normalization keeps every offset valid)
// ---------------------------------------------------------------------------------------------

function normalizeQuotes(s: string): string {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

/** Top-level balanced `{…}` ranges, end exclusive. */
function findBraces(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (s[i] === '}' && depth > 0) { depth--; if (depth === 0) out.push([start, i + 1]); }
  }
  return out;
}

const COND_KEYWORDS = ['ifOr', 'else', 'if', 'fi'];

/** The keyword of an `if{` / `ifOr{` / `else{` / `fi{` condition brace at `brace`, or null. */
export function conditionKeyword(text: string, brace: number): string | null {
  for (const kw of COND_KEYWORDS) {
    const k = brace - kw.length;
    if (k >= 0 && text.substring(k, brace) === kw && (k === 0 || !/\w/.test(text[k - 1]))) return kw;
  }
  return null;
}

function isConditionAt(text: string, brace: number): boolean {
  return conditionKeyword(text, brace) !== null;
}

type Entry = {
  key: string;
  keyStart: number;
  kind: 'string' | 'object' | 'array' | 'other';
  /** Unquoted string content; the raw literal for 'other'; '' for objects and arrays. */
  value: string;
  /** Offset of the value's content: after the opening quote for a string, after `{`/`[` otherwise. */
  start: number;
  end: number;
};

/**
 * The top-level entries of the object `text[open, close)` (`{` at `open`, `}` at `close - 1`).
 * Lenient: anything it cannot read is skipped — the JSON validator reports malformed params.
 */
function scanObject(raw: string, open: number, close: number): Entry[] {
  const s = normalizeQuotes(raw);
  const out: Entry[] = [];
  let i = open + 1;
  const end = close - 1;
  const ws = () => { while (i < end && /\s/.test(s[i])) i++; };
  const skipString = (j: number) => {
    const q = s[j];
    j++;
    while (j < end && s[j] !== q) { if (s[j] === '\\') j++; j++; }
    return j;
  };
  const skipNested = (j: number) => {
    let depth = 0;
    for (; j < end; j++) {
      const c = s[j];
      if (c === '"' || c === "'") { j = skipString(j); continue; }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { depth--; if (depth === 0) return j + 1; }
    }
    return j;
  };
  while (i < end) {
    ws();
    let key = '';
    let keyStart = i;
    if (s[i] === '"' || s[i] === "'") {
      const kEnd = skipString(i);
      key = s.slice(i + 1, kEnd);
      keyStart = i + 1;
      i = kEnd + 1;
    } else {
      const m = /^[A-Za-z_$][\w$.]*/.exec(s.slice(i, end));
      if (!m) break;
      key = m[0];
      i += m[0].length;
    }
    ws();
    if (s[i] !== ':') break;
    i++;
    ws();
    const c = s[i];
    if (c === '"' || c === "'") {
      const vEnd = skipString(i);
      out.push({ key, keyStart, kind: 'string', value: raw.slice(i + 1, vEnd), start: i + 1, end: vEnd });
      i = vEnd + 1;
    } else if (c === '{' || c === '[') {
      const vEnd = skipNested(i);
      out.push({ key, keyStart, kind: c === '{' ? 'object' : 'array', value: '', start: i + 1, end: vEnd - 1 });
      i = vEnd;
    } else {
      const m = /^[^,}\n]*/.exec(s.slice(i, end));
      out.push({ key, keyStart, kind: 'other', value: (m?.[0] ?? '').trim(), start: i, end: i + (m?.[0].length ?? 0) });
      i += m?.[0].length ?? 0;
    }
    ws();
    if (s[i] === ',') i++;
  }
  return out;
}

/** The elements of the array `text[start, end)`: strings with their content offsets, objects as ranges. */
function scanArray(raw: string, start: number, end: number): Array<{ kind: 'string' | 'object' | 'other'; value: string; start: number; end: number }> {
  const s = normalizeQuotes(raw);
  const out: Array<{ kind: 'string' | 'object' | 'other'; value: string; start: number; end: number }> = [];
  for (let i = start; i < end; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < end && s[j] !== c) { if (s[j] === '\\') j++; j++; }
      out.push({ kind: 'string', value: raw.slice(i + 1, j), start: i + 1, end: j });
      i = j;
    } else if (c === '{') {
      let depth = 0;
      let j = i;
      for (; j < end; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') { depth--; if (depth === 0) break; }
      }
      out.push({ kind: 'object', value: '', start: i + 1, end: j });
      i = j;
    } else if (/[\w-]/.test(c)) {
      let j = i;
      while (j < end && /[\w.-]/.test(s[j])) j++;
      out.push({ kind: 'other', value: s.slice(i, j), start: i, end: j });
      i = j - 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Did you mean
// ---------------------------------------------------------------------------------------------

function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], (prev[j - 2] ?? 0) + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Up to three close names from `pool`, best first. */
export function suggest(id: string, pool: Iterable<string>): string[] {
  const lower = id.toLowerCase();
  const max = id.length <= 4 ? 1 : id.length <= 9 ? 2 : 3;
  const scored: Array<[string, number]> = [];
  for (const c of pool) {
    if (c === id) continue;
    const d = c.toLowerCase() === lower ? 0 : distance(lower, c.toLowerCase(), max);
    if (d <= max) scored.push([c, d]);
  }
  scored.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return scored.slice(0, 3).map(([c]) => c);
}

// ---------------------------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------------------------

/** How a `ref` names its ids in messages. */
const REF_LABEL: Record<string, string> = {
  assets: 'Asset', music: 'Music track', sounds: 'Sound', character: 'Character', character_template: 'Character template',
  character_templates: 'Character template', character_slot_templates: 'Actor slot', character_skin_layers: 'Skin layer',
  character_traits: 'Trait', character_stats: 'Stat', character_statuses: 'Status', item_templates: 'Item', records: 'Record',
  properties: 'Property', item_slots: 'Item slot', ability_templates: 'Ability', item_recipes: 'Recipe',
  item_inventories: 'Inventory', pool_entries: 'Pool', item_categories: 'Item category', grade_presets: 'Grade preset',
  flash_presets: 'Flash color', ambient_kinds: 'Ambient', actor_animations: 'Animation', state: 'State',
};

export function refLabel(ref: string): string {
  return REF_LABEL[ref] ?? `'${ref.split('/').pop()}' id`;
}

/** Refs the checks resolve themselves rather than from an id list. */
export const SPECIAL_REFS = new Set(['any', 'room', 'dungeon', 'flag', 'state', 'quest_log', 'attribute']);

/** Every data file the descriptions point at — the ids the context has to load. */
export function refsOf(spec: ValueSpec | undefined, out: Set<string> = new Set()): Set<string> {
  if (!spec || typeof spec === 'string') return out;
  if ('ref' in spec) {
    if (!SPECIAL_REFS.has(spec.ref) && !(spec.ref in BUILTIN_LISTS) && spec.ref !== 'character' && spec.ref !== 'character_template') out.add(spec.ref);
  } else if ('list' in spec) refsOf(spec.list, out);
  else if ('pair' in spec) { refsOf(spec.pair[0], out); refsOf(spec.pair[1], out); }
  else if ('ops' in spec) {
    refsOf(spec.ops.target, out);
    refsOf(spec.ops.key, out);
    for (const t of Object.values(spec.ops.typed ?? {})) refsOf(t, out);
    if (spec.ops.value !== 'of') refsOf(spec.ops.value, out);
  } else if ('targeted' in spec) { refsOf(spec.targeted, out); refsOf(spec.target, out); }
  else if ('oneOf' in spec) for (const s of spec.oneOf) refsOf(s, out);
  else if ('fields' in spec) for (const s of Object.values(spec.fields)) refsOf(s, out);
  return out;
}

/** Where a text sits, for the checks that depend on it. */
export type TextScope = {
  /** The block's kind, for its header keys. */
  kind: Block['kind'] | null;
  /** The room the block belongs to (`^room` above it), or null. */
  room: string | null;
  /** True inside a `$template` block: bare scene and anchor names resolve where the template is used. */
  inTemplate: boolean;
  /** Prose (scene columns, encounter text): speaker tags, links, placeholders and effects apply. */
  prose: boolean;
  /** The block's `__meta` status is todo or wip: unfinished content, so flag warnings stay quiet. */
  unfinished: boolean;
  ignore: Set<string>;
};

/** What a `{…}` params string is: a block header, a choice's params, or a `%` column's (never read). */
export type ParamsKind = 'header' | 'choice' | 'ignored';

type Ctx = { lint: LintContext; self: DungeonIndex; out: RefIssue[]; scope: TextScope; text: string };

function report(c: Ctx, issue: RefIssue) {
  if (issue.ignoreKey && c.scope.ignore.has(issue.ignoreKey)) issue.ignored = true;
  c.out.push(issue);
}

function fixesFor(id: string, start: number, pool: Iterable<string>, label = (s: string) => s): RefFix[] {
  return suggest(id, pool).map((s) => ({ label: label(s), start, end: start + id.length, text: s }));
}

/** The ids a ref names, or null when the editor cannot know them (nothing loaded): then nothing is checked. */
function poolOf(c: Ctx, ref: string): Set<string> | null {
  if (ref in BUILTIN_LISTS) return new Set(BUILTIN_LISTS[ref]);
  if (ref === 'state') return c.lint.vocab.open.has('state') ? null : new Set(c.lint.vocab.states.keys());
  const pool = c.lint.ids.get(ref);
  if (!pool || pool.size === 0) return null;
  if (ref === 'character') return new Set([...pool, ...c.self.createdCharacters]);
  return pool;
}

function checkId(c: Ctx, ref: string, id: string, start: number, severity: RefIssue['severity'] = 'warning', label?: string) {
  if (!id || id.includes('|')) return;                       // a |placeholder| resolves at runtime
  const pool = poolOf(c, ref);
  if (!pool || pool.has(id)) return;
  report(c, {
    severity, start, end: start + id.length, fixes: fixesFor(id, start, pool), ignoreKey: `${ref}:${id}`,
    message: `${label ?? refLabel(ref)} '${id}' not found`,
  });
}

/** The index of a dungeon by id: the live one for the dungeon being checked. */
function dungeonIndex(c: Ctx, id: string): DungeonIndex | undefined {
  return id === c.lint.dungeonId ? c.self : c.lint.dungeons.get(id);
}

function checkDungeonId(c: Ctx, id: string, start: number): DungeonIndex | undefined {
  const d = dungeonIndex(c, id);
  if (!d) {
    report(c, {
      severity: 'warning', start, end: start + id.length, ignoreKey: `dungeon:${id}`,
      message: `Dungeon '${id}' not found`,
      fixes: fixesFor(id, start, [c.lint.dungeonId, ...c.lint.dungeons.keys()]),
    });
  }
  return d;
}

/** A scene id: `next`, `shift:N`, `&anchor`, `&dungeon.anchor`, or 1/2/3/5/6 dotted parts (DungeonSystem.resolveSceneId). */
function checkSceneRef(c: Ctx, p: Piece) {
  const v = p.text;
  const start = p.start;
  if (!v || v === 'next' || v.startsWith('shift:') || v.includes('|')) return;
  if (v.startsWith('&')) {
    const parts = v.slice(1).split('.');
    if (parts.length > 2) {
      report(c, { severity: 'error', start, end: start + v.length, message: `'${v}' is not an anchor: use &anchor or &dungeon.anchor` });
      return;
    }
    if (parts.length === 1 && c.scope.inTemplate) return;
    const d = parts.length === 2 ? checkDungeonId(c, parts[0], start + 1) : c.self;
    if (!d) return;
    const name = parts[parts.length - 1];
    const nameStart = start + v.length - name.length;
    if (!d.anchors.has(name)) {
      report(c, {
        severity: 'warning', start: nameStart, end: nameStart + name.length, ignoreKey: `anchor:${name}`,
        message: `Anchor '&${name}' not found${parts.length === 2 ? ` in dungeon '${parts[0]}'` : ''}`,
        fixes: fixesFor(name, nameStart, d.anchors, (s) => `&${s}`),
      });
    }
    return;
  }
  const parts = v.split('.');
  const strip = (s: string) => (s.startsWith('#') ? s.slice(1) : s);
  const sceneIn = (d: DungeonIndex, room: string, scene: string, sceneStart: number, where: string) => {
    if (!d.rooms.has(room) && !d.scenesByRoom.has(room)) {
      report(c, { severity: 'warning', start, end: start + v.length, ignoreKey: `scene:${v}`, message: `Room '${room}' not found${where}` });
      return;
    }
    const scenes = d.scenesByRoom.get(room) ?? new Set<string>();
    if (scenes.has(scene)) return;
    report(c, {
      severity: 'warning', start: sceneStart, end: sceneStart + scene.length, ignoreKey: `scene:${v}`,
      message: `Scene '${scene}' not found in room ${room}${where}`,
      fixes: fixesFor(scene, sceneStart, scenes),
    });
  };
  if (parts.length === 1) {
    if (c.scope.inTemplate || c.scope.room === null) return;
    const scene = strip(parts[0]);
    const sceneStart = start + v.length - scene.length;
    const here = c.self.scenesByRoom.get(c.scope.room);
    if (here?.has(scene)) return;
    const elsewhere = [...c.self.scenesByRoom].find(([, set]) => set.has(scene))?.[0];
    if (elsewhere !== undefined) {
      report(c, {
        severity: 'warning', start, end: start + v.length, ignoreKey: `scene:${v}`,
        message: `Scene '${scene}' is in room ${elsewhere}, not room ${c.scope.room} — a bare name looks in the current room`,
        fixes: [{ label: `${elsewhere}.${scene}`, start, end: start + v.length, text: `${elsewhere}.${scene}` }],
      });
      return;
    }
    report(c, {
      severity: 'warning', start: sceneStart, end: sceneStart + scene.length, ignoreKey: `scene:${v}`,
      message: `Scene '${scene}' not found in room ${c.scope.room}`,
      fixes: fixesFor(scene, sceneStart, here ?? []),
    });
    return;
  }
  if (parts.length === 2) {
    sceneIn(c.self, strip(parts[0]), parts[1], start + v.length - parts[1].length, '');
    return;
  }
  if (parts.length === 3) {
    const dId = strip(parts[0]);
    const d = checkDungeonId(c, dId, start + (parts[0].startsWith('#') ? 1 : 0));
    if (d) sceneIn(d, parts[1], parts[2], start + v.length - parts[2].length, ` of dungeon '${dId}'`);
    return;
  }
  if (parts.length === 5) {
    sceneIn(c.self, strip(parts[0]), parts[1], start + v.indexOf('.') + 1, '');
    return;
  }
  if (parts.length === 6) {
    const dId = strip(parts[0]);
    const d = checkDungeonId(c, dId, start + (parts[0].startsWith('#') ? 1 : 0));
    const sceneStart = start + parts[0].length + parts[1].length + 2;
    if (d) sceneIn(d, parts[1], parts[2], sceneStart, ` of dungeon '${dId}'`);
  }
}

/** `room` in this dungeon, or `dungeon.room`. */
function checkRoom(c: Ctx, p: Piece, fatal: boolean) {
  const v = p.text;
  if (!v || v.includes('|')) return;
  const dot = v.indexOf('.');
  const d = dot === -1 ? c.self : checkDungeonId(c, v.slice(0, dot), p.start);
  if (!d) return;
  const room = dot === -1 ? v : v.slice(dot + 1);
  const roomStart = p.start + v.length - room.length;
  if (d.rooms.has(room)) return;
  report(c, {
    severity: fatal ? 'error' : 'warning', start: roomStart, end: roomStart + room.length, ignoreKey: `room:${v}`,
    message: `Room '${room}' not found${dot === -1 ? '' : ` in dungeon '${v.slice(0, dot)}'`}`,
    fixes: fixesFor(room, roomStart, d.rooms),
  });
}

/** `quest.goal.log` (a `$template` of this dungeon) or `dungeon.quest.goal.log`; a leading `$` is allowed. */
function checkQuestLog(c: Ctx, p: Piece) {
  let v = p.text;
  let start = p.start;
  if (!v || v.includes('|')) return;
  if (v.startsWith('$')) { v = v.slice(1); start += 1; }
  const parts = v.split('.');
  if (parts.length !== 3 && parts.length !== 4) {
    report(c, { severity: 'warning', start, end: start + v.length, message: `'${v}' is not a quest log: write quest.goal.log or dungeon.quest.goal.log` });
    return;
  }
  const d = parts.length === 4 ? checkDungeonId(c, parts[0], start) : c.self;
  if (!d) return;
  const id = parts.slice(-3).join('.');
  const idStart = start + v.length - id.length;
  if (d.templates.has(id)) return;
  report(c, {
    severity: 'warning', start: idStart, end: idStart + id.length, ignoreKey: `quest:${v}`,
    message: `Quest log '$${id}' not found${parts.length === 4 ? ` in dungeon '${parts[0]}'` : ''}`,
    fixes: fixesFor(id, idStart, d.templates),
  });
}

/** A `{flag}` write's id: a name, or `dungeon.name` into another dungeon. */
function checkFlagWrite(c: Ctx, p: Piece) {
  const dot = p.text.indexOf('.');
  if (dot !== -1 && !p.text.includes('|')) checkDungeonId(c, p.text.slice(0, dot), p.start);
}

/**
 * An attribute key (`face` in `ane.face = hurt`): its values follow, or a skin layer takes
 * true / false (the runtime's fallback). Returns the values the key accepts, or null for any.
 */
function checkAttributeKey(c: Ctx, p: Piece): string[] | null {
  const key = p.text;
  if (!key || key.includes('|')) return null;
  if (c.lint.attributes.has(key)) return c.lint.attributes.get(key)!.length ? c.lint.attributes.get(key)! : null;
  const layers = c.lint.ids.get('character_skin_layers');
  if (layers?.has(key)) return ['true', 'false'];
  if (!c.lint.attributes.size) return null;
  report(c, {
    severity: 'warning', start: p.start, end: p.start + key.length, ignoreKey: `attribute:${key}`,
    message: `'${key}' is not an attribute or a skin layer`,
    fixes: fixesFor(key, p.start, [...c.lint.attributes.keys(), ...(layers ?? [])]),
  });
  return null;
}

/** Check one id-shaped piece against a RefSpec. Returns the values an `of` key accepts. */
function checkRef(c: Ctx, spec: RefSpec, p: Piece, severity?: RefIssue['severity']): string[] | null {
  let t = p.text;
  let start = p.start;
  if (!t || t.includes('|')) return null;
  if (spec.words?.includes(t)) return null;
  if (t.startsWith('!')) {
    if (spec.stop) return null;
    if (spec.remove) {
      const rest = t.slice(1);
      start += 1 + (rest.length - rest.trimStart().length);
      t = rest.trim();
    }
  }
  if (spec.prefix && t.startsWith(spec.prefix)) { t = t.slice(spec.prefix.length); start += spec.prefix.length; }
  let piece: Piece = { text: t, start };
  if (t.includes('(')) {
    const { id, props } = splitProps(piece);
    piece = id;
    if (Array.isArray(spec.props)) {
      for (const { key } of props) {
        if (!key.text || spec.props.includes(key.text)) continue;
        report(c, {
          severity: 'warning', start: key.start, end: key.start + key.text.length,
          message: `'${key.text}' is not a property here: ${spec.props.join(', ')}`,
          fixes: fixesFor(key.text, key.start, spec.props),
        });
      }
    }
    if (spec.newWith && props.some((pr) => spec.newWith!.includes(pr.key.text))) return null;
  }
  if (spec.count) {
    const hash = piece.text.indexOf('#');
    if (hash !== -1) piece = { text: piece.text.slice(0, hash).trimEnd(), start: piece.start };
  }
  if (spec.paths && piece.text.includes('/')) return null;
  if (spec.root) {
    const dot = piece.text.indexOf('.');
    if (dot !== -1) piece = { text: piece.text.slice(0, dot), start: piece.start };
  }
  const sev = severity ?? (spec.fatal ? 'error' : 'warning');
  switch (spec.ref) {
    case 'any': return null;
    case 'room': checkRoom(c, piece, !!spec.fatal); return null;
    case 'dungeon': checkDungeonId(c, piece.text, piece.start); return null;
    case 'flag': checkFlagWrite(c, piece); return null;
    case 'quest_log': checkQuestLog(c, piece); return null;
    case 'attribute': return checkAttributeKey(c, piece);
    default: checkId(c, spec.ref, piece.text, piece.start, sev, spec.label); return null;
  }
}

/** Which kinds of JSON value a description takes. */
export function accepts(spec: ValueSpec, kind: 'string' | 'object' | 'array' | 'other'): boolean {
  if (spec === 'any') return true;
  if (typeof spec === 'string') {
    // `{if: true}` is an always-on condition.
    if (spec === 'boolean' || spec === 'number' || spec === 'condition') return kind === 'other' || kind === 'string';
    return kind === 'string';
  }
  if ('oneOf' in spec) return spec.oneOf.some((s) => accepts(s, kind));
  if ('fields' in spec) return kind === 'object';
  return kind === 'string';
}

function describe(spec: ValueSpec): string {
  const forms = new Set<string>();
  const add = (s: ValueSpec) => {
    if (typeof s === 'string') forms.add(s === 'boolean' ? 'true / false' : s === 'number' ? 'a number' : s === 'any' ? 'anything' : 'a string');
    else if ('oneOf' in s) s.oneOf.forEach(add);
    else if ('fields' in s) forms.add(`{ ${Object.keys(s.fields).join(', ')} }`);
    else forms.add('a string');
  };
  add(spec);
  return [...forms].join(' or ');
}

/** The string form a oneOf picks: the first whose prefix matches, else the first string form without one. */
export function stringForm(spec: ValueSpec, text: string): ValueSpec | null {
  if (typeof spec === 'string' || !('oneOf' in spec)) return accepts(spec, 'string') ? spec : null;
  const forms = spec.oneOf.filter((s) => typeof s !== 'string' ? accepts(s, 'string') : s !== 'boolean' && s !== 'number');
  const prefixOf = (s: ValueSpec) => (typeof s === 'object' && ('ref' in s || 'list' in s) ? s.prefix : undefined);
  const prefixed = forms.find((s) => { const p = prefixOf(s); return p && text.trimStart().startsWith(p); });
  if (prefixed) return prefixed;
  return forms.find((s) => !prefixOf(s)) ?? null;
}

/** Check a string value against its description. */
function checkString(c: Ctx, spec: ValueSpec, p: Piece) {
  const form = stringForm(spec, p.text);
  if (!form) return;
  if (typeof form === 'string') {
    if (form === 'scene') checkSceneRef(c, trimPiece(p));
    else if (form === 'condition') checkCondition(c, p.text, p.start);
    return;
  }
  if ('ref' in form) { checkRef(c, form, trimPiece(p)); return; }
  if ('words' in form && !('list' in form)) { checkWords(c, form.words, trimPiece(p)); return; }
  if ('list' in form) {
    let list = trimPiece(p);
    if (form.prefix && list.text.startsWith(form.prefix)) list = { text: list.text.slice(form.prefix.length), start: list.start + form.prefix.length };
    for (const part of splitParts(list.text, list.start)) {
      if (!part.text || form.words?.includes(part.text)) continue;
      checkString(c, form.list, part);
    }
    return;
  }
  if ('pair' in form) {
    const sep = form.sep ?? '->';
    const t = trimPiece(p);
    const at = sep === ' ' ? t.text.search(/\s/) : t.text.indexOf(sep);
    if (at === -1) {
      if (form.optional) checkString(c, form.pair[0], t);
      else report(c, { severity: 'warning', start: t.start, end: t.start + t.text.length, message: `'${t.text}' needs two parts: left${sep === ' ' ? ' ' : sep}right` });
      return;
    }
    checkString(c, form.pair[0], { text: t.text.slice(0, at), start: t.start });
    const rightRaw = t.text.slice(at + (sep === ' ' ? 1 : sep.length));
    checkString(c, form.pair[1], trimPiece({ text: rightRaw, start: t.start + at + (sep === ' ' ? 1 : sep.length) }));
    return;
  }
  if ('ops' in form) { checkOps(c, form, p); return; }
  if ('targeted' in form) {
    for (const group of splitTargeted(p.text, p.start)) {
      if (!group.target) {
        if (form.bareRemove && group.spec.text.startsWith('!')) {
          checkString(c, form.target ?? { ref: 'character' }, trimPiece({ text: group.spec.text.slice(1), start: group.spec.start + 1 }));
          continue;
        }
        report(c, { severity: 'warning', start: group.spec.start, end: group.spec.start + group.spec.text.length, message: `'${group.spec.text}' has no '->': write target->id` });
        continue;
      }
      checkString(c, form.target ?? { ref: 'character' }, group.target);
      for (const item of group.items) checkString(c, form.targeted, item.name);
    }
  }
}

/** A closed word list: the value is one of them. */
function checkWords(c: Ctx, words: string[], p: Piece) {
  if (!p.text || p.text.includes('|') || words.includes(p.text)) return;
  report(c, {
    severity: 'warning', start: p.start, end: p.start + p.text.length, ignoreKey: `value:${p.text}`,
    message: `'${p.text}' is not one of ${words.join(', ')}`,
    fixes: fixesFor(p.text, p.start, words),
  });
}

function trimPiece(p: Piece): Piece {
  return { text: p.text.trim(), start: p.start + (p.text.length - p.text.trimStart().length) };
}

/** `target.key op value` lists against an OpsSpec. */
function checkOps(c: Ctx, form: OpsSpec, p: Piece) {
  const { target, key, typed, value } = form.ops;
  const isFlag = typeof key === 'object' && 'ref' in key && key.ref === 'flag';
  for (const op of splitOps(p.text, p.start)) {
    if (!op.id || !op.value) {
      report(c, {
        severity: 'warning', start: op.spec.start, end: op.spec.start + op.spec.text.length,
        message: `'${op.spec.text}' is not id = value (or += / -=)`,
      });
      continue;
    }
    if (op.id.text.includes('|')) continue;
    let values: string[] | null = null;
    const segs = op.id.text.split('.');
    const seg = (i: number): Piece => {
      let s = op.id!.start;
      for (let j = 0; j < i; j++) s += segs[j].length + 1;
      return { text: segs[i], start: s };
    };
    if (target) {
      const need = typed ? 3 : 2;
      if (segs.length !== need) continue;
      checkString(c, target, seg(0));
      if (typed) {
        const type = segs[1];
        const keySpec = typed[type];
        if (!keySpec) {
          const tp = seg(1);
          report(c, {
            severity: 'warning', start: tp.start, end: tp.start + type.length,
            message: `'${type}' is not one of ${Object.keys(typed).join(', ')}`,
            fixes: fixesFor(type, tp.start, Object.keys(typed)),
          });
          continue;
        }
        values = checkKey(c, keySpec, seg(2));
      } else if (key) values = checkKey(c, key, seg(1));
    } else if (key) {
      values = checkKey(c, key, op.id);
    }
    const v = op.value;
    if (v.text.includes('|')) continue;
    if (value === 'of') {
      if (values && !values.includes(v.text)) {
        const k = segs[segs.length - 1];
        report(c, {
          severity: 'warning', start: v.start, end: v.start + v.text.length, ignoreKey: `value:${k}=${v.text}`,
          message: values.length === 2 && values[0] === 'true'
            ? `'${k}' is a skin layer: its value must be true or false`
            : `'${v.text}' is not in the values listed for attribute '${k}' (${values.slice(0, 8).join(', ')}${values.length > 8 ? ', …' : ''})`,
          fixes: fixesFor(v.text, v.start, values),
        });
      }
    } else if (value === 'number') {
      if (!Number.isFinite(Number(v.text))) {
        const fix = v.text === 'true' ? '1' : v.text === 'false' ? '0' : null;
        report(c, {
          severity: 'warning', start: v.start, end: v.start + v.text.length,
          message: isFlag ? `Flags hold numbers, not '${v.text}'` : `'${v.text}' is not a number`,
          fixes: fix ? [{ label: fix, start: v.start, end: v.start + v.text.length, text: fix }] : [],
        });
      }
    } else if (value) checkString(c, value, v);
  }
}

function checkKey(c: Ctx, spec: ValueSpec, p: Piece): string[] | null {
  if (typeof spec === 'object' && 'ref' in spec) return checkRef(c, spec, p);
  checkString(c, spec, p);
  return null;
}

/** Check an object value (`{id: …}`) against a description's fields form. */
function checkFields(c: Ctx, spec: ValueSpec, open: number, close: number) {
  const form = typeof spec === 'object' && 'oneOf' in spec ? spec.oneOf.find((s) => typeof s === 'object' && 'fields' in s) : spec;
  if (!form || typeof form !== 'object' || !('fields' in form)) return;
  for (const entry of scanObject(c.text, open, close)) {
    const f = form.fields[entry.key];
    if (f) checkEntry(c, entry.key, f, entry);
  }
}

/** Check one `key: value` entry against its description, whatever JSON kind the value is. */
function checkEntry(c: Ctx, key: string, spec: ValueSpec, entry: Entry) {
  if (entry.kind === 'array') {
    // The runtime dispatches an array value once per element.
    for (const el of scanArray(c.text, entry.start, entry.end)) {
      if (el.kind === 'string') checkEntry(c, key, spec, { ...entry, kind: 'string', value: el.value, start: el.start, end: el.end });
      else if (el.kind === 'object') checkEntry(c, key, spec, { ...entry, kind: 'object', start: el.start, end: el.end });
    }
    return;
  }
  if (!accepts(spec, entry.kind)) {
    const end = entry.kind === 'string' ? entry.end : entry.kind === 'other' ? entry.end : entry.end + 1;
    const start = entry.kind === 'string' || entry.kind === 'other' ? entry.start : entry.start - 1;
    report(c, { severity: 'warning', start, end, message: `'${key}' takes ${describe(spec)}` });
    return;
  }
  if (entry.kind === 'string') checkString(c, spec, { text: entry.value, start: entry.start });
  else if (entry.kind === 'object') checkFields(c, spec, entry.start - 1, entry.end + 1);
}

// --- conditions ------------------------------------------------------------------------------

const CLAUSE_OP = /^([a-zA-Z0-9_.]+(?:\([^)]*\))?)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/;
const CLAUSE_BARE = /^[a-zA-Z0-9_.]+(?:\([^)]*\))?$/;

/** Check one condition string: `a = 1, _x(y) > 2, flag` (if / ifOr / active / activeOr / if{…}). */
function checkCondition(c: Ctx, v: string, start: number) {
  let depth = 0;
  let from = 0;
  const clauses: Piece[] = [];
  for (let i = 0; i <= v.length; i++) {
    const ch = v[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (i === v.length || (ch === ',' && depth === 0)) {
      const raw = v.slice(from, i);
      if (raw.trim()) clauses.push({ text: raw.trim(), start: start + from + (raw.length - raw.trimStart().length) });
      from = i + 1;
    }
  }
  for (const { text, start: s } of clauses) {
    if (text.includes('|')) continue;
    const opens = (text.match(/\(/g) || []).length;
    const closes = (text.match(/\)/g) || []).length;
    if (opens !== closes) {
      report(c, { severity: 'warning', start: s, end: s + text.length, message: `Unbalanced parentheses in '${text}'` });
      continue;
    }
    const m = text.match(CLAUSE_OP);
    const key = m ? m[1] : CLAUSE_BARE.test(text) ? text : null;
    if (!key) {
      report(c, {
        severity: 'warning', start: s, end: s + text.length,
        message: `'${text}' is not a condition — write name = value, or a bare name to test that it is set`,
      });
      continue;
    }
    if (m) {
      const op = m[2];
      const value = m[3].trim();
      if (['>', '<', '>=', '<='].includes(op) && !Number.isFinite(Number(value)) && value !== 'true' && value !== 'false') {
        report(c, { severity: 'warning', start: s, end: s + text.length, message: `'${text}' compares with a word using ${op}, so it is always false` });
      }
    }
    if (key.startsWith('_')) {
      checkConditionCall(c, key, s);
      continue;
    }
    if (key.includes('(')) {
      const fixed = `_${key}`;
      report(c, {
        severity: 'warning', start: s, end: s + key.length, message: `'${key}' reads a flag with that literal name — conditions start with _`,
        fixes: [{ label: fixed, start: s, end: s + key.length, text: fixed }],
      });
      continue;
    }
    checkFlagRead(c, key, s);
  }
}

/** `_name` or `_name(arg, arg)`: a registered condition, with each argument checked. */
function checkConditionCall(c: Ctx, key: string, start: number) {
  const m = key.match(/^(_[a-zA-Z0-9_]+)(?:\(([^)]*)\))?$/);
  if (!m) return;
  const name = m[1];
  const info = c.lint.vocab.conditions.get(name);
  if (!info) {
    if (c.lint.vocab.open.has('condition')) return;
    report(c, {
      severity: 'warning', start, end: start + name.length, ignoreKey: `condition:${name}`,
      message: `Condition '${name}' is not registered`,
      fixes: fixesFor(name, start, c.lint.vocab.conditions.keys()),
    });
    return;
  }
  if (!info.args || m[2] === undefined) return;
  checkArgs(c, info.args, m[2], start + name.length + 1);
}

/** Comma-separated `(…)` arguments, split as the runtime does (no nesting). */
function checkArgs(c: Ctx, args: ValueSpec[], raw: string, start: number) {
  let from = 0;
  raw.split(',').forEach((a, i) => {
    const spec = args[i];
    if (spec && spec !== 'any') checkString(c, spec, trimPiece({ text: a, start: start + from }));
    from += a.length + 1;
  });
}

function checkFlagRead(c: Ctx, key: string, start: number) {
  const parts = key.split('.');
  if (parts.length > 2) {
    report(c, { severity: 'warning', start, end: start + key.length, message: `'${key}' has more than one dot — a flag is name or dungeon.name` });
    return;
  }
  if (c.lint.scriptFlags.has(key) || c.scope.unfinished) return;
  const self = c.lint.dungeonId;
  const writesInto = (dId: string): Set<string> => {
    const set = new Set<string>(dungeonIndex(c, dId)?.flagWrites ?? []);
    for (const d of [c.self, ...c.lint.dungeons.values()]) for (const f of d.scopedFlagWrites.get(dId) ?? []) set.add(f);
    return set;
  };
  let dId = self;
  let name = key;
  if (parts.length === 2) {
    dId = parts[0];
    name = parts[1];
    if (!dungeonIndex(c, dId)) {
      report(c, {
        severity: 'error', start, end: start + dId.length, ignoreKey: `dungeon:${dId}`,
        message: `Dungeon '${dId}' not found`,
        fixes: fixesFor(dId, start, [self, ...c.lint.dungeons.keys()]),
      });
      return;
    }
    if (c.lint.scriptFlags.has(name)) return;
  }
  const writes = writesInto(dId);
  if (writes.has(name)) return;
  const nameStart = start + key.length - name.length;
  const elsewhere = [self, ...c.lint.dungeons.keys()].filter((d) => d !== dId && writesInto(d).has(name));
  if (elsewhere.length) {
    report(c, {
      severity: 'warning', start, end: start + key.length, ignoreKey: `flag:${key}`,
      message: `Flag '${name}' is read${parts.length === 2 ? ` from ${dId}` : ''} but only set in ${elsewhere.slice(0, 3).join(', ')} — write ${elsewhere[0]}.${name}, or set it in this dungeon`,
      fixes: parts.length === 1 ? [{ label: `${elsewhere[0]}.${name}`, start, end: start + key.length, text: `${elsewhere[0]}.${name}` }] : [],
    });
    return;
  }
  report(c, {
    severity: 'warning', start: nameStart, end: nameStart + name.length, ignoreKey: `flag:${key}`,
    message: `Flag '${name}' is read but no content line sets it`,
    fixes: fixesFor(name, nameStart, writes),
  });
}

// --- prose -------------------------------------------------------------------------------------

const PLACEHOLDER_NAME = /^([a-zA-Z0-9_'’-]+)(?:\(([^)]*)\))?$/;

function checkProse(c: Ctx, text: string) {
  // `[[record]]`, `[[!record>Label]]`, `[[item:id]]`, `[[status:id]]` — resolveLoreLinks.
  for (const m of text.matchAll(/\[\[(!?)(?:([a-z]+):)?([a-zA-Z0-9_.-]+)(?:(?:>|&gt;)([^\]]+?))?\]\]/g)) {
    const ref = m[2] === 'item' ? 'item_templates' : m[2] === 'status' ? 'character_statuses' : !m[2] || m[2] === 'record' ? 'records' : null;
    if (!ref) continue;
    const idStart = m.index! + 2 + m[1].length + (m[2] ? m[2].length + 1 : 0);
    checkId(c, ref, m[3], idStart);
  }
  // `|$template|`, `|$template~2|`, `|$dungeon.template|`
  for (const m of text.matchAll(/\|\$([\w.]+?)(?:~\d+)?\|/g)) {
    if (c.scope.inTemplate && !m[1].includes('.')) continue;
    const id = m[1];
    const s = m.index! + 2;
    if (c.self.templates.has(id)) continue;
    const dot = id.indexOf('.');
    if (dot !== -1) {
      const d = dungeonIndex(c, id.slice(0, dot));
      if (d) {
        const t = id.slice(dot + 1);
        if (!d.templates.has(t)) {
          report(c, {
            severity: 'warning', start: s + dot + 1, end: s + id.length, ignoreKey: `template:${id}`,
            message: `Template '$${t}' not found in dungeon '${id.slice(0, dot)}'`,
            fixes: fixesFor(t, s + dot + 1, d.templates),
          });
        }
        continue;
      }
    }
    report(c, {
      severity: 'warning', start: s, end: s + id.length, ignoreKey: `template:${id}`,
      message: `Template '$${id}' not found in this dungeon`,
      fixes: fixesFor(id, s, c.self.templates),
    });
  }
  // `|name|` / `|name(args)|` — resolveTextPlaceholders; `$` / `@` are templates and narrative slots.
  const vocab = c.lint.vocab;
  for (const m of text.matchAll(/\|([^|\n]+?)\|/g)) {
    const inner = m[1];
    if (inner.startsWith('$') || inner.startsWith('@')) continue;
    const pm = inner.match(PLACEHOLDER_NAME);
    if (!pm) continue;
    const name = pm[1].replace(/’/g, "'");
    const s = m.index! + 1;
    const info = vocab.placeholders.get(name);
    if (!info) {
      if (vocab.open.has('placeholder')) continue;
      report(c, {
        severity: 'warning', start: s, end: s + pm[1].length, ignoreKey: `placeholder:${name}`,
        message: `Placeholder '|${name}|' is not registered`,
        fixes: fixesFor(name, s, vocab.placeholders.keys()),
      });
      continue;
    }
    if (info.args && pm[2] !== undefined) checkArgs(c, info.args, pm[2], s + pm[1].length + 1);
  }
  // `[effect]…[/effect]`: a name that is closed somewhere is meant as an effect.
  if (!vocab.open.has('effect')) {
    const closes = new Set([...text.matchAll(/\[\/([a-z][a-z0-9_-]*)\]/g)].map((m) => m[1]));
    for (const m of text.matchAll(/\[([a-z][a-z0-9_-]*)\]/g)) {
      const name = m[1];
      if (!closes.has(name) || !TEXT_EFFECT_NAME_REGEX.test(name) || RESERVED_TEXT_TAGS.includes(name) || vocab.effects.has(name)) continue;
      report(c, {
        severity: 'warning', start: m.index! + 1, end: m.index! + 1 + name.length, ignoreKey: `effect:${name}`,
        message: `Text effect '[${name}]' is not registered`,
        fixes: fixesFor(name, m.index! + 1, vocab.effects.keys()),
      });
    }
  }
  // `id: text` / `id!: text` — the first line of a paragraph names its speaker (resolveTalkingCharacter).
  let atParagraphStart = true;
  let offset = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) atParagraphStart = true;
    // Anchors, choices, row numbers and action-only lines carry no text: the speaker tag is on the
    // first line the reader sees (actions are stripped before the tag is read).
    else if (t.startsWith('&') || t.startsWith('>') || /^\d+$/.test(t) || (t.startsWith('{') && t.endsWith('}'))) { /* not prose */ }
    else if (atParagraphStart) {
      atParagraphStart = false;
      const m = line.match(/^(\w+)(!?):\s/);
      if (m && !/^\d+$/.test(m[1])) checkId(c, 'character', m[1], offset);
    }
    offset += line.length + 1;
  }
}

// --- action objects --------------------------------------------------------------------------

/** Where an action object sits: it decides which keys mean something there. */
type ObjectPlace = { kind: 'header'; block: Block['kind'] } | { kind: 'choice' } | { kind: 'paragraph' };

/** Keys that configure a choice; in a paragraph they do nothing (ignore_replay beside {choices} aside). */
const CHOICE_ONLY = new Set(Object.keys(CHOICE_KEYS).filter((k) => k !== 'ignore_replay'));

function checkObject(c: Ctx, s: number, e: number, place: ObjectPlace) {
  const entries = scanObject(c.text, s, e);
  const vocab = c.lint.vocab;
  // A `{wip: true}` choice can never fire, so its actions' values are not read yet (an exit
  // into a dungeon still to be ported). Their names are still checked.
  const wip = place.kind !== 'header' && entries.some((x) => x.key === 'wip' && x.value === 'true');
  for (const entry of entries) {
    const { key } = entry;
    if (key === '__meta') continue;
    const keyEnd = entry.keyStart + key.length;

    if (place.kind === 'header') {
      if (place.block === 'raw') continue;
      const keys = HEADER_KEYS[place.block];
      const info = keys[key];
      if (!info) {
        report(c, {
          severity: 'warning', start: entry.keyStart, end: keyEnd, ignoreKey: `key:${key}`,
          message: `'${key}' does nothing in a ${place.block} header — it takes ${Object.keys(keys).filter((k) => k !== '__meta').join(', ') || 'no keys'}`,
          fixes: fixesFor(key, entry.keyStart, Object.keys(keys).filter((k) => k !== '__meta')),
        });
        continue;
      }
      // A gallery replay's stage is an action object of its own.
      if (key === 'replay' && entry.kind === 'object') { checkObject(c, entry.start - 1, entry.end + 1, { kind: 'paragraph' }); continue; }
      if (info.value) checkEntry(c, key, info.value, entry);
      continue;
    }

    const choiceKey = CHOICE_KEYS[key] ?? DATA_KEYS[key];
    if (choiceKey) {
      if (place.kind === 'paragraph' && CHOICE_ONLY.has(key)) {
        report(c, {
          severity: 'warning', start: entry.keyStart, end: keyEnd, ignoreKey: `key:${key}`,
          message: `'${key}' configures a choice — in a paragraph it does nothing. Use if{…}…fi{} for text, or put it on a choice`,
        });
        continue;
      }
      if (key === 'title' && !entries.some((x) => (x.key === 'loot' || x.key === 'trade') && x.kind === 'string' && x.value.trim().startsWith('^'))) {
        report(c, {
          severity: 'warning', start: entry.keyStart, end: keyEnd,
          message: `'title' only works beside a "^pool" loot or trade`,
        });
        continue;
      }
      if (choiceKey.value) checkEntry(c, key, choiceKey.value, entry);
      continue;
    }

    const action = vocab.actions.get(key);
    if (!action) {
      if (vocab.open.has('action')) continue;
      report(c, {
        severity: 'warning', start: entry.keyStart, end: keyEnd, ignoreKey: `action:${key}`,
        message: `Unknown action '${key}'`,
        fixes: fixesFor(key, entry.keyStart, [...vocab.actions.keys(), ...Object.keys(CHOICE_KEYS)]),
      });
      continue;
    }
    if (action.value && !wip) checkEntry(c, key, action.value, entry);
  }
}

/** The line of `text` holding offset `at`. */
function lineAround(text: string, at: number): { line: string; start: number } {
  const start = text.lastIndexOf('\n', at - 1) + 1;
  const end = text.indexOf('\n', at);
  return { line: text.slice(start, end === -1 ? undefined : end), start };
}

/** Whether the `{` at `at` belongs to a `>` choice: on its line, or alone on the line right under it. */
function onChoiceLine(text: string, at: number): boolean {
  const { line, start } = lineAround(text, at);
  if (line.trimStart().startsWith('>')) return true;
  if (!/^\s*\{.*\}\s*$/.test(line) || start === 0) return false;
  return lineAround(text, start - 1).line.trimStart().startsWith('>');
}

/** Every `{…}` action object and `if{…}` condition in a text: check what each names. */
function checkActionText(c: Ctx, text: string) {
  for (const [s, e] of findBraces(text)) {
    const kw = conditionKeyword(text, s);
    if (kw === 'fi') continue;
    if (kw) {
      const inner = text.slice(s + 1, e - 1);
      if (kw === 'else' && !inner.trim()) continue;
      checkCondition(c, inner, s + 1);
      continue;
    }
    checkObject(c, s, e, onChoiceLine(text, s) ? { kind: 'choice' } : { kind: 'paragraph' });
  }
}

/**
 * Check one editable text of a block. `params` names a `{…}` params string (block header, choice,
 * or a `%` column's, which the parser never reads); without it the text is content: comment lines
 * and `[code]` spans are skipped, and offsets stay in `text`.
 */
export function checkRefsInText(
  text: string, params: ParamsKind | null, scope: TextScope, lint: LintContext, self: DungeonIndex,
): RefIssue[] {
  const out: RefIssue[] = [];
  if (params) {
    const c: Ctx = { lint, self, out, scope, text };
    const [s, e] = findBraces(text)[0] ?? [-1, -1];
    if (s === -1) return out;
    if (params === 'ignored') {
      for (const entry of scanObject(text, s, e)) {
        if (entry.key === '__meta') continue;
        report(c, { severity: 'warning', start: entry.keyStart, end: entry.keyStart + entry.key.length, message: `'${entry.key}' does nothing on a % column` });
      }
      return out;
    }
    checkObject(c, s, e, params === 'header' ? { kind: 'header', block: scope.kind ?? 'raw' } : { kind: 'choice' });
    return out;
  }
  const { text: live, toOriginal } = stripCommentLinesMapped(text);
  const sanitized = stripCodeBlocks(live);
  const c: Ctx = { lint, self, out, scope, text: sanitized };
  checkActionText(c, sanitized);
  if (scope.prose) checkProse(c, sanitized);
  for (const issue of out) {
    const s = toOriginal(issue.start);
    const delta = s - issue.start;
    issue.start = s;
    issue.end = toOriginal(issue.end - 1) + 1;
    for (const f of issue.fixes ?? []) { f.start += delta; f.end += delta; }
  }
  return out;
}

/** The checking scope of every block of a document, in block order. */
export function blockScopes(doc: Document): Array<Omit<TextScope, 'prose'>> {
  let room: string | null = null;
  return doc.blocks.map((block) => {
    if (block?.kind === 'room') room = block.id;
    const meta = block && 'paramsRaw' in block ? readMeta(block.paramsRaw) : null;
    const ignore = Array.isArray(meta?.ignore) ? new Set((meta!.ignore as unknown[]).map(String)) : new Set<string>();
    return {
      kind: block?.kind ?? null,
      room: block?.kind === 'template' ? null : room,
      inTemplate: block?.kind === 'template',
      unfinished: meta?.status === 'todo' || meta?.status === 'wip',
      ignore,
    };
  });
}
