import { StorageSerializers, useStorage } from '@vueuse/core';
import { jsonrepair } from 'jsonrepair';

/**
 * Play from here: what the Content tab can start a playtest from, the values set before it plays,
 * and the setup remembered per target. The game side reads the marker in devPlaytest.ts.
 */

export type SetFirstKind = 'property' | 'flag' | 'item' | 'character';

export interface SetFirstRow {
  kind: SetFirstKind;
  /** Property id, flag (`door_open` or `dungeon.flag`), item id, or `character.type.key`. */
  key: string;
  /** The value; for an item, how many. */
  value: string;
}

export type ConditionKey = 'if' | 'ifOr' | 'active' | 'activeOr';

export interface PlayTarget {
  dungeonId: string;
  /** `#room.scene.row.col.para` for a paragraph, `~room.scene.row.col` for a branch. */
  id: string;
  /** What the popover title names: `~Ask about trust`, `#start`. */
  title: string;
  /** Where it sits, in words. */
  where: string;
  /** The conditions that gate it: a scene header's, or a branch choice's own. */
  conditions: Partial<Record<ConditionKey, string | boolean>>;
}

export interface PlaySetup {
  /** 'new', or the id of the snapshot to start from. */
  start: string;
  rows: SetFirstRow[];
}

export const SET_FIRST_KINDS: { kind: SetFirstKind; label: string; keyHint: string; valueHint: string }[] = [
  { kind: 'property', label: 'property', keyHint: 'trust', valueHint: '2' },
  { kind: 'flag', label: 'flag', keyHint: 'door_open', valueHint: '1' },
  { kind: 'item', label: 'item', keyHint: 'item id', valueHint: '1' },
  { kind: 'character', label: 'character', keyHint: 'riko.attribute.mood', valueHint: 'blush' },
];

// ---------------------------------------------------------------------------------------------
// Remembered setups and the scene being edited

const setups = useStorage<Record<string, PlaySetup>>('dev_play_from_setups', {});

function setupKey(gameId: string, target: Pick<PlayTarget, 'dungeonId' | 'id'>): string {
  return `${gameId}|${target.dungeonId}|${target.id}`;
}

export function rememberedSetup(gameId: string, target: Pick<PlayTarget, 'dungeonId' | 'id'>): PlaySetup | null {
  const setup = setups.value[setupKey(gameId, target)];
  return setup && Array.isArray(setup.rows) ? setup : null;
}

export function rememberSetup(gameId: string, target: Pick<PlayTarget, 'dungeonId' | 'id'>, setup: PlaySetup): void {
  setups.value = { ...setups.value, [setupKey(gameId, target)]: setup };
}

/** The scene block last focused or scrolled to in the Content tab, for Playtest ▾. */
export const editingScene = useStorage<{ gameId: string; target: PlayTarget } | null>(
  'dev_editing_scene', null, undefined, { serializer: StorageSerializers.object },
);

// ---------------------------------------------------------------------------------------------
// Reading a target's place

/** A block or column's `{params}` as an object; null when they don't parse. */
export function parseParams(paramsRaw: string | undefined): Record<string, any> | null {
  const raw = paramsRaw?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(jsonrepair(raw.startsWith('{') ? raw : `{${raw}}`));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function conditionsOf(params: Record<string, any> | null, keys: ConditionKey[]): PlayTarget['conditions'] {
  const out: PlayTarget['conditions'] = {};
  for (const key of keys) {
    const value = params?.[key];
    if (typeof value === 'string' || typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/**
 * The paragraph (1-based) holding `offset` in a column's text, as the game numbers them: blank
 * lines split paragraphs and comment lines don't count. A caret on a blank line belongs to the
 * paragraph after it.
 */
export function paragraphAt(text: string, offset: number): number {
  let count = 0;
  let inParagraph = false;
  let position = 0;
  let at: number | null = null;
  for (const line of text.split('\n')) {
    const lineEnd = position + line.length;
    const isComment = /^\s*\/\//.test(line);
    if (line.trim() === '') {
      inParagraph = false;
    } else if (!isComment && !inParagraph) {
      inParagraph = true;
      count++;
    }
    if (at === null && offset <= lineEnd) at = inParagraph ? count : count + 1;
    position = lineEnd + 1;
  }
  return Math.max(1, Math.min(at ?? count, count));
}

// ---------------------------------------------------------------------------------------------
// Filling values from a condition

export interface Prefill {
  rows: SetFirstRow[];
  /** `key = value` for each row that came from a clause. */
  filled: string[];
  /** Clauses no value here can make true. */
  unfilled: string[];
  /** The conditions read, as `if: "…"`, for the note. */
  read: string[];
}

const CLAUSE = /^([a-zA-Z0-9_.]+(?:\([^)]*\))?)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/;
const BARE = /^[a-zA-Z0-9_.]+(?:\([^)]*\))?$/;

function splitClauses(source: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of source) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function literal(raw: string): string | number | boolean {
  const text = raw.trim();
  if (text === 'true' || text === 'false') return text === 'true';
  if (text !== '' && !isNaN(Number(text))) return Number(text);
  return text;
}

function holds(value: string, operator: string, expected: string | number | boolean): boolean {
  const actual = literal(value);
  switch (operator) {
    case '=': case '==': return actual == expected;
    case '!=': return actual != expected;
    case '>': return Number(actual) > Number(expected);
    case '<': return Number(actual) < Number(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<=': return Number(actual) <= Number(expected);
  }
  return false;
}

/** A value making `key operator expected` true, or null when none can be told. */
function solve(operator: string | null, expected: string | number | boolean | undefined, propertyType?: string): string | null {
  if (operator === null) return propertyType === 'boolean' ? 'true' : propertyType === 'string' ? null : '1';
  if (typeof expected === 'boolean') {
    if (operator === '=' || operator === '==') return String(expected);
    if (operator === '!=') return String(!expected);
    return null;
  }
  if (typeof expected === 'number') {
    switch (operator) {
      case '=': case '==': case '>=': case '<=': return String(expected);
      case '>': return String(expected + 1);
      case '<': return String(expected - 1);
      case '!=': return String(expected + 1);
    }
    return null;
  }
  return operator === '=' || operator === '==' ? String(expected) : null;
}

/**
 * Values that make a target's conditions true, for simple clauses on properties
 * (`_property(trust) >= 2`) and flags (`door_open`, `town.gate = 1`, `x > 3`). An …Or group
 * needs one clause, so the first that can be filled is. `propertyTypes` maps a property id to
 * its type, where known.
 */
export function prefillFromConditions(conditions: PlayTarget['conditions'], propertyTypes: Map<string, string>): Prefill {
  const result: Prefill = { rows: [], filled: [], unfilled: [], read: [] };
  const byKey = new Map<string, SetFirstRow>();

  const tryClause = (clause: string): boolean => {
    const match = clause.match(CLAUSE);
    if (!match && !BARE.test(clause)) return false;
    const key = match ? match[1] : clause;
    const operator = match ? match[2] : null;
    const expected = match ? literal(match[3]) : undefined;
    const property = key.match(/^_property\(\s*([a-zA-Z0-9_]+)\s*\)$/)?.[1];
    if (key.startsWith('_') && !property) return false;
    const kind: SetFirstKind = property ? 'property' : 'flag';
    const id = property ?? key;
    const type = property ? propertyTypes.get(property) : 'number';
    // Flags hold numbers.
    if (kind === 'flag' && typeof expected === 'string') return false;
    const rowKey = `${kind}|${id}`;
    const existing = byKey.get(rowKey);
    if (existing) return operator === null ? !!literal(existing.value) : holds(existing.value, operator, expected!);
    const value = solve(operator, expected, type);
    if (value === null) return false;
    const row: SetFirstRow = { kind, key: id, value };
    byKey.set(rowKey, row);
    result.rows.push(row);
    result.filled.push(`${id} = ${value}`);
    return true;
  };

  for (const key of ['if', 'ifOr', 'active', 'activeOr'] as ConditionKey[]) {
    const source = conditions[key];
    if (source === undefined) continue;
    result.read.push(`${key}: ${typeof source === 'string' ? `"${source}"` : source}`);
    if (typeof source === 'boolean') {
      if (!source) result.unfilled.push('false');
      continue;
    }
    const clauses = splitClauses(source);
    if (key === 'if' || key === 'active') {
      for (const clause of clauses) {
        if (!tryClause(clause)) result.unfilled.push(clause);
      }
    } else if (clauses.length && !clauses.some((clause) => tryClause(clause))) {
      result.unfilled.push(clauses.join(' or '));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// The action the game runs

/**
 * The Set-first rows as one action object, e.g. `{property: "trust = 2", flag: "town.gate = 1"}`.
 * A bare flag is the target dungeon's, which is where the target reads it.
 */
export function setFirstAction(rows: SetFirstRow[], dungeonId: string): string {
  const groups: Record<string, string[]> = {};
  const add = (action: string, spec: string) => (groups[action] ??= []).push(spec);
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key) continue;
    if (row.kind === 'property') add('property', `${key} = ${value}`);
    else if (row.kind === 'flag') add('flag', `${key.includes('.') ? key : `${dungeonId}.${key}`} = ${value || 0}`);
    else if (row.kind === 'item') {
      const count = Math.floor(Number(value) || 1);
      add('add_item', count > 1 ? `${key}#${count}` : key);
    } else add('char', `${key} = ${value}`);
  }
  const entries = Object.entries(groups);
  if (!entries.length) return '';
  return `{${entries.map(([action, specs]) => `${action}: ${JSON.stringify(specs.join(', '))}`).join(', ')}}`;
}
