import { splitCommas, splitParts, splitTargeted, type Piece } from '../contentGrammar';
import {
  BUILTIN_LISTS, CHOICE_KEYS, DATA_KEYS, HEADER_KEYS,
  type CallEntry, type OpsSpec, type RefSpec, type ValueSpec, type VocabEntry,
} from '../contentVocabulary';
import { TEXT_COLORS } from '../textTags';
import {
  accepts, conditionKeyword, refLabel, stringForm,
  type DungeonIndex, type EntryInfo, type LintContext, type NameInfo, type TextScope,
} from './refs';

/**
 * Completion and hover for dungeon content. One question drives both: what is at this offset?
 * It is answered from the same value descriptions the checks use (refs.ts), walked down to the
 * part under the caret, so an action that describes its value gets completion and hover too.
 * Works on the text as the author sees it, and on text still being typed (unclosed braces).
 */

/** `actions`: a bare action object, run as it is (the game's debug panel): no choice keys. */
/** `condition`: the whole text is one condition, as inside `if{…}` (the debug console). */
export type AssistMode = 'header' | 'choice' | 'prose' | 'content' | 'actions' | 'condition';

/** Where a text sits: its mode, its block's scope, and what the checks know. */
export type AssistPlace = {
  mode: AssistMode;
  scope: Omit<TextScope, 'prose'>;
  lint: LintContext;
  self: DungeonIndex;
};

export type Candidate = {
  /** Replaces the token. */
  text: string;
  /** Typed after `text`; the caret then sits `caretBack` characters before the end. */
  after?: string;
  caretBack?: number;
  label: string;
  detail?: string;
  help?: string;
  /** Ways to write it, shown under the help. */
  examples?: string[];
  image?: string;
  group?: string;
  /** The detail is a display name, so typing it finds the entry too (help lines are not searched). */
  findByDetail?: boolean;
};

export type Completion = { start: number; end: number; title: string; items: Candidate[] };

export type JumpTarget =
  | { kind: 'entity'; ref: string; id: string }
  | { kind: 'scene'; dungeon: string; room: string; scene: string }
  | { kind: 'anchor'; dungeon: string; name: string }
  | { kind: 'template'; dungeon: string; id: string }
  | { kind: 'room'; dungeon: string; room: string };

export type HoverInfo = {
  /** The id or name under the pointer. */
  id: string;
  kind: string;
  name?: string;
  image?: string;
  lines: string[];
  examples?: string[];
  jump?: JumpTarget;
};

// ---------------------------------------------------------------------------------------------
// What is at an offset
// ---------------------------------------------------------------------------------------------

type KeyEntry = VocabEntry & Partial<NameInfo>;

type Slot = { start: number; end: number } & (
  | { kind: 'key'; keys: Map<string, KeyEntry>; colon: boolean; title: string }
  | { kind: 'ref'; spec: RefSpec; words?: string[] }
  | { kind: 'words'; words: string[]; title: string }
  | { kind: 'scene' }
  | { kind: 'condition-name' }
  | { kind: 'flag' }
  | { kind: 'placeholder' }
  | { kind: 'effect' }
  | { kind: 'template' }
  | { kind: 'link'; ref: string }
  | { kind: 'speaker' }
);

const QUOTE_OPEN = new Set(['"', "'", '“', '‘']);
const closes = (open: string, c: string) =>
  open === '“' ? c === '”' || c === '"' : open === '‘' ? c === '’' || c === "'" : c === open;

type Frame = {
  type: '{' | '[' | 'cond';
  open: number;
  /** The key whose value this object or array is (nested frames). */
  parentKey: string | null;
  parent: Frame | null;
  state: 'key' | 'colon' | 'value' | 'after';
  key: string;
  keyStart: number;
};

/** Walk `text` up to `caret`: the open braces around it, and whether the caret is inside a string. */
function framesAt(text: string, caret: number): { frame: Frame | null; str: { quote: string; start: number; key: boolean } | null } {
  let frame: Frame | null = null;
  let str: { quote: string; start: number; key: boolean } | null = null;
  for (let i = 0; i < caret; i++) {
    const c = text[i];
    if (c === '\n') {
      // Strings end with their line, and a blank line ends any `{…}`: the parser reads it as a
      // paragraph break. Content still being typed is never left open past either.
      str = null;
      if (/^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i))) frame = null;
      continue;
    }
    if (str) {
      if (c === '\\') { i++; continue; }
      if (closes(str.quote, c)) {
        if (frame && frame.type === '{') {
          if (str.key) { frame.key = text.slice(str.start, i); frame.state = 'colon'; }
          else frame.state = 'after';
        }
        str = null;
      }
      continue;
    }
    if (!frame) {
      if (c === '{') {
        const kw = conditionKeyword(text, i);
        frame = { type: kw ? 'cond' : '{', open: i, parentKey: null, parent: null, state: 'key', key: '', keyStart: i + 1 };
      }
      continue;
    }
    if (frame.type === 'cond') {
      if (c === '}') frame = frame.parent;
      continue;
    }
    if (QUOTE_OPEN.has(c)) {
      const key = frame.type === '{' && frame.state === 'key';
      if (key) frame.keyStart = i + 1;
      str = { quote: c, start: i + 1, key };
      continue;
    }
    if (c === '{' || c === '[') {
      const parentKey = frame.type === '{' ? frame.key : frame.parentKey;
      frame = { type: c, open: i, parentKey, parent: frame, state: 'key', key: '', keyStart: i + 1 };
      continue;
    }
    if (c === '}' || c === ']') {
      frame = frame.parent;
      if (frame && frame.type === '{') frame.state = 'after';
      continue;
    }
    if (frame.type !== '{') continue;
    if (c === ',') { frame.state = 'key'; frame.key = ''; frame.keyStart = i + 1; continue; }
    if (c === ':' && (frame.state === 'key' || frame.state === 'colon')) {
      if (frame.state === 'key') frame.key = text.slice(frame.keyStart, i).trim();
      frame.state = 'value';
      continue;
    }
    if (frame.state === 'key' && /\s/.test(c) && text.slice(frame.keyStart, i).trim()) frame.state = 'colon';
  }
  return { frame, str };
}

function identEnd(text: string, from: number): number {
  let j = from;
  while (j < text.length && /[\w$.-]/.test(text[j])) j++;
  return j;
}

/** The string value around the caret: from its opening quote to its closing one, or the line end. */
function stringPiece(text: string, start: number, quote: string): Piece {
  let j = start;
  while (j < text.length && !closes(quote, text[j]) && text[j] !== '\n') { if (text[j] === '\\') j++; j++; }
  return { text: text.slice(start, j), start };
}

/** The object a nested frame belongs to, past any array between them. */
function ownerOf(frame: Frame | null): Frame | null {
  let o = frame;
  while (o && o.type !== '{') o = o.parent;
  return o;
}

/** The keys a `{…}` frame takes, and the description of each key's value. */
function keysOf(frame: Frame, place: AssistPlace): { keys: Map<string, KeyEntry>; title: string } {
  const owner = ownerOf(frame.parent);
  // A gallery replay's stage in a scene header is an action object of its own.
  if (owner && !owner.parent && place.mode === 'header' && frame.parentKey === 'replay') return actionKeys(place);
  if (owner) {
    // A nested object: the fields its parent key's value describes.
    const spec = valueOfKey(owner, frame.parentKey ?? '', place);
    const fields = findFields(spec);
    return { keys: new Map(Object.entries(fields ?? {}).map(([k, v]) => [k, { value: v }])), title: `${frame.parentKey} fields` };
  }
  if (place.mode === 'header') {
    const kind = place.scope.kind;
    const keys = kind && kind !== 'raw' ? HEADER_KEYS[kind] : {};
    return { keys: new Map(Object.entries(keys).filter(([k]) => k !== '__meta').map(([k, v]) => [k, { ...v, source: 'header' }])), title: `${kind} header` };
  }
  return actionKeys(place);
}

function actionKeys(place: AssistPlace): { keys: Map<string, KeyEntry>; title: string } {
  const keys = new Map<string, KeyEntry>();
  for (const [k, v] of place.lint.vocab.actions) keys.set(k, v);
  if (place.mode === 'actions') return { keys, title: 'Actions' };
  for (const [k, v] of Object.entries({ ...CHOICE_KEYS, ...DATA_KEYS })) if (k !== '__meta') keys.set(k, { ...v, source: 'choice' });
  return { keys, title: 'Actions' };
}

function valueOfKey(frame: Frame, key: string, place: AssistPlace): ValueSpec | undefined {
  return keysOf(frame, place).keys.get(key)?.value;
}

function findFields(spec: ValueSpec | undefined): Record<string, ValueSpec> | null {
  if (!spec || typeof spec === 'string') return null;
  if ('fields' in spec) return spec.fields;
  if ('oneOf' in spec) for (const s of spec.oneOf) { const f = findFields(s); if (f) return f; }
  return null;
}

/** What is at `caret` in `text`: the slot to complete or describe, or null. */
function slotAt(text: string, caret: number, place: AssistPlace, explicit: boolean): Slot | null {
  if (place.mode === 'condition') return conditionSlot({ text, start: 0 }, caret, place);
  const { frame, str } = framesAt(text, caret);
  if (frame) {
    if (frame.type === 'cond') {
      const close = text.indexOf('}', frame.open);
      const piece = { text: text.slice(frame.open + 1, close === -1 || close < caret ? lineEnd(text, caret) : close), start: frame.open + 1 };
      return conditionSlot(piece, caret, place);
    }
    // The key of a `{…}` or the value of one: an array's strings belong to the key that holds it.
    const owner = frame.type === '[' ? ownerOf(frame) : frame;
    const key = frame.type === '[' ? frame.parentKey ?? '' : frame.key;
    if (str?.key && frame.type === '{') {
      const { keys, title } = keysOf(frame, place);
      return { kind: 'key', start: str.start, end: identEnd(text, caret), keys, colon: true, title };
    }
    if (str && owner) {
      const spec = valueOfKey(owner, key, place);
      if (!spec) return null;
      return valueSlot(spec, stringPiece(text, str.start, str.quote), caret, place);
    }
    if (frame.type === '{' && (frame.state === 'key' || frame.state === 'colon') && /^\s*[\w$]*$/.test(text.slice(frame.keyStart, caret))) {
      const lead = text.slice(frame.keyStart, caret).length - text.slice(frame.keyStart, caret).trimStart().length;
      const start = frame.keyStart + lead;
      const end = identEnd(text, caret);
      const { keys, title } = keysOf(frame, place);
      return { kind: 'key', start, end, keys, colon: /^\s*:/.test(text.slice(end)), title };
    }
    if (frame.type === '{' && frame.state === 'value') {
      // A bare word after `key:` – true / false where the value takes them.
      const m = /([\w]*)$/.exec(text.slice(0, caret));
      const start = caret - (m?.[1].length ?? 0);
      if (!/^\s*$/.test(text.slice(text.lastIndexOf(':', caret - 1) + 1, start))) return null;
      const spec = valueOfKey(frame, frame.key, place);
      if (spec && accepts(spec, 'other') && spec !== 'any') return { kind: 'words', start, end: identEnd(text, caret), words: ['true', 'false'], title: frame.key };
    }
    return null;
  }
  if (place.mode === 'header' || place.mode === 'choice' || place.mode === 'actions') return null;
  return proseSlot(text, caret, place, explicit);
}

function lineEnd(text: string, from: number): number {
  const nl = text.indexOf('\n', from);
  return nl === -1 ? text.length : nl;
}

/** Outside braces: a `|placeholder|`, a `[[link]]`, an `[effect]`, or a speaker tag. */
function proseSlot(text: string, caret: number, place: AssistPlace, explicit: boolean): Slot | null {
  const ls = text.lastIndexOf('\n', caret - 1) + 1;
  const before = text.slice(ls, caret);
  // Inside |…|: an odd number of pipes before the caret on this line.
  const pipes = before.split('|').length - 1;
  if (pipes % 2 === 1) {
    const at = ls + before.lastIndexOf('|') + 1;
    const rest = text.slice(at);
    const close = rest.search(/[|\n]/);
    const inner = rest.slice(0, close === -1 ? rest.length : close);
    if (inner.startsWith('$')) {
      return { kind: 'template', start: at + 1, end: at + 1 + (/^[\w.]*/.exec(inner.slice(1))?.[0].length ?? 0) };
    }
    if (inner.startsWith('@')) return null;
    const paren = inner.indexOf('(');
    if (paren !== -1 && caret > at + paren) {
      const name = inner.slice(0, paren).replace(/’/g, "'");
      const info = place.lint.vocab.placeholders.get(name);
      const argsEnd = inner.indexOf(')', paren);
      return argSlot(info, { text: inner.slice(paren + 1, argsEnd === -1 ? undefined : argsEnd), start: at + paren + 1 }, caret, place);
    }
    return { kind: 'placeholder', start: at, end: at + (/^[\w'’-]*/.exec(inner)?.[0].length ?? 0) };
  }
  // [[link: the last `[[` before the caret with no `]]` after it on the way.
  const link = before.lastIndexOf('[[');
  if (link !== -1 && !before.slice(link).includes(']]')) {
    let start = ls + link + 2;
    let token = text.slice(start, caret);
    if (token.startsWith('!')) { start += 1; token = token.slice(1); }
    let ref = 'records';
    const typed = /^(item|status|record):/.exec(token);
    if (typed) {
      ref = typed[1] === 'item' ? 'item_templates' : typed[1] === 'status' ? 'character_statuses' : 'records';
      start += typed[0].length;
    }
    if (text.slice(start, caret).includes('>')) return null;
    return { kind: 'link', ref, start, end: identEnd(text, caret) };
  }
  // [effect
  const fx = /\[\/?([a-z][\w-]*)?$/.exec(before);
  if (fx && !before.endsWith('[[')) {
    const start = caret - (fx[1]?.length ?? 0);
    return { kind: 'effect', start, end: identEnd(text, caret) };
  }
  // A speaker: the first word of a paragraph's first line, asked for with the hotkey.
  if (explicit && /^\w*$/.test(before) && (ls === 0 || /\n\s*\n$/.test(text.slice(0, ls)) || isParagraphStart(text, ls))) {
    return { kind: 'speaker', start: ls, end: identEnd(text, caret) };
  }
  return null;
}

function isParagraphStart(text: string, ls: number): boolean {
  const prev = text.lastIndexOf('\n', ls - 2);
  const line = text.slice(prev + 1, ls - 1).trim();
  return !line || line.startsWith('&') || /^\d+$/.test(line) || line.startsWith('//');
}

/** A condition: `_name(args)`, a flag, `dungeon.flag`. */
function conditionSlot(piece: Piece, caret: number, place: AssistPlace): Slot | null {
  let depth = 0;
  let from = 0;
  let clause: Piece | null = null;
  const v = piece.text;
  for (let i = 0; i <= v.length; i++) {
    const ch = v[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (i === v.length || (ch === ',' && depth === 0)) {
      if (caret >= piece.start + from && caret <= piece.start + i) clause = { text: v.slice(from, i), start: piece.start + from };
      from = i + 1;
    }
  }
  if (!clause) return null;
  const lead = clause.text.length - clause.text.trimStart().length;
  const text = clause.text.trimStart();
  const start = clause.start + lead;
  // The operator, outside parentheses.
  let opAt = -1;
  for (let i = 0, d = 0; i < text.length; i++) {
    if (text[i] === '(') d++;
    else if (text[i] === ')') d--;
    else if (d === 0 && /[=!<>]/.test(text[i])) { opAt = i; break; }
  }
  if (opAt !== -1 && caret > start + opAt) return null;
  const key = (opAt === -1 ? text : text.slice(0, opAt)).trimEnd();
  if (key.startsWith('_')) {
    const paren = key.indexOf('(');
    if (paren === -1 || caret <= start + paren) return { kind: 'condition-name', start, end: start + (paren === -1 ? key.length : paren) };
    const info = place.lint.vocab.conditions.get(key.slice(0, paren));
    const close = key.indexOf(')', paren);
    return argSlot(info, { text: key.slice(paren + 1, close === -1 ? undefined : close), start: start + paren + 1 }, caret, place);
  }
  if (/^[\w.]*$/.test(key)) return { kind: 'flag', start, end: start + key.length };
  return null;
}

/** The `(…)` argument of a condition or placeholder under the caret. */
function argSlot(info: CallEntry | undefined, inner: Piece, caret: number, place: AssistPlace): Slot | null {
  if (!info?.args) return null;
  let from = 0;
  const parts = inner.text.split(',');
  for (let i = 0; i < parts.length; i++) {
    const s = inner.start + from;
    if (caret >= s && caret <= s + parts[i].length) {
      const spec = info.args[i];
      if (!spec || spec === 'any') return null;
      const lead = parts[i].length - parts[i].trimStart().length;
      return valueSlot(spec, { text: parts[i].trim(), start: s + lead }, caret, place);
    }
    from += parts[i].length + 1;
  }
  return null;
}

/** The part of a string value under the caret, walked down its description. */
function valueSlot(spec: ValueSpec, p: Piece, caret: number, place: AssistPlace, words?: string[]): Slot | null {
  const form = stringForm(spec, p.text);
  if (!form) return null;
  if (typeof form === 'string') {
    if (form === 'scene') return { kind: 'scene', ...trimmed(p) };
    if (form === 'condition') return conditionSlot(p, caret, place);
    return null;
  }
  if ('ref' in form) return refSlot(form, trim(p), caret, words);
  if ('words' in form && !('list' in form)) return { kind: 'words', ...trimmed(p), words: [...(words ?? []), ...form.words], title: 'Values' };
  if ('list' in form) {
    let list = trim(p);
    if (form.prefix && list.text.startsWith(form.prefix)) list = { text: list.text.slice(form.prefix.length), start: list.start + form.prefix.length };
    const part = splitParts(list.text, list.start).find((x) => caret >= x.start && caret <= x.start + x.text.length)
      ?? { text: '', start: caret };
    return valueSlot(form.list, part, caret, place, [...(words ?? []), ...(form.words ?? [])]);
  }
  if ('pair' in form) {
    const t = trim(p);
    const sep = form.sep ?? '->';
    const at = sep === ' ' ? t.text.search(/\s/) : t.text.indexOf(sep);
    if (at === -1 || caret <= t.start + at) return valueSlot(form.pair[0], { text: at === -1 ? t.text : t.text.slice(0, at), start: t.start }, caret, place, words);
    const rs = t.start + at + (sep === ' ' ? 1 : sep.length);
    return valueSlot(form.pair[1], trim({ text: t.text.slice(at + (sep === ' ' ? 1 : sep.length)), start: rs }), caret, place);
  }
  if ('ops' in form) return opsSlot(form, p, caret, place);
  if ('targeted' in form) {
    const group = splitParts(p.text, p.start).find((x) => caret >= x.start && caret <= x.start + x.text.length) ?? { text: '', start: caret };
    const arrow = group.text.indexOf('->');
    const target = form.target ?? { ref: 'character' };
    if (arrow === -1 || caret <= group.start + arrow) {
      let t = { text: arrow === -1 ? group.text : group.text.slice(0, arrow), start: group.start };
      if (t.text.startsWith('!')) t = { text: t.text.slice(1), start: t.start + 1 };
      return valueSlot(target, trim(t), caret, place);
    }
    const items = splitTargeted(group.text, group.start)[0]?.items ?? [];
    const item = items.find((x) => caret >= x.name.start && caret <= x.name.start + x.name.text.length);
    if (item) return valueSlot(form.targeted, item.name, caret, place);
    return valueSlot(form.targeted, { text: '', start: caret }, caret, place);
  }
  return null;
}

function trim(p: Piece): Piece {
  return { text: p.text.trim(), start: p.start + (p.text.length - p.text.trimStart().length) };
}

function trimmed(p: Piece): { start: number; end: number } {
  const t = trim(p);
  return { start: t.start, end: t.start + t.text.length };
}

function refSlot(spec: RefSpec, p: Piece, caret: number, words?: string[]): Slot | null {
  let t = p.text;
  let s = p.start;
  if (t.startsWith('!') && (spec.remove || spec.stop)) {
    if (spec.stop) return null;
    t = t.slice(1);
    s += 1;
  }
  if (spec.prefix && t.startsWith(spec.prefix)) { t = t.slice(spec.prefix.length); s += spec.prefix.length; }
  const paren = t.indexOf('(');
  if (paren !== -1 && caret > s + paren) {
    if (!Array.isArray(spec.props)) return null;
    // A prop name inside `(…)`: the word before `=` under the caret.
    const inner = t.slice(paren + 1);
    let from = 0;
    for (const part of inner.split(',')) {
      const ps = s + paren + 1 + from;
      const eq = part.indexOf('=');
      const keyEnd = eq === -1 ? part.length : eq;
      if (caret >= ps && caret <= ps + keyEnd) {
        const lead = part.length - part.trimStart().length;
        return { kind: 'words', start: ps + lead, end: ps + part.slice(0, keyEnd).trimEnd().length, words: spec.props, title: 'Properties' };
      }
      from += part.length + 1;
    }
    return null;
  }
  let id = paren === -1 ? t : t.slice(0, paren);
  if (spec.count && id.includes('#')) {
    if (caret > s + id.indexOf('#')) return null;
    id = id.slice(0, id.indexOf('#'));
  }
  if (spec.paths && id.includes('/')) return null;
  if (spec.root && id.includes('.')) {
    if (caret > s + id.indexOf('.')) return null;
    id = id.slice(0, id.indexOf('.'));
  }
  if (spec.ref === 'any') {
    const all = [...(words ?? []), ...(spec.words ?? [])];
    return all.length ? { kind: 'words', start: s, end: s + id.trimEnd().length, words: all, title: 'Values' } : null;
  }
  return { kind: 'ref', spec, start: s, end: s + id.trimEnd().length, words: [...(words ?? []), ...(spec.words ?? [])] };
}

function opsSlot(form: OpsSpec, p: Piece, caret: number, place: AssistPlace): Slot | null {
  const spec = splitCommas(p.text, p.start).find((x) => caret >= x.start && caret <= x.start + x.text.length) ?? { text: '', start: caret };
  const m = /^([^=<>+\s]*)(\s*(?:\+=|-=|=)\s*)?(.*)$/.exec(spec.text) ?? ['', spec.text, undefined, ''];
  const id = m[1];
  const opLen = m[2]?.length ?? 0;
  const { target, key, typed, value } = form.ops;
  if (!m[2] || caret <= spec.start + id.length) {
    // In the id: `target.key` or `target.type.key`, one segment per dot.
    const segs = id.split('.');
    let at = spec.start;
    for (let i = 0; i < segs.length; i++) {
      const seg = { text: segs[i], start: at };
      if (caret <= at + segs[i].length) {
        if (target && i === 0) return valueSlot(target, seg, caret, place);
        if (!target) return key ? keySlot(key, { text: id, start: spec.start }, caret, place) : null;
        if (typed && i === 1) return { kind: 'words', start: seg.start, end: seg.start + seg.text.length, words: Object.keys(typed), title: 'Kind' };
        if (typed && i === 2) return typed[segs[1]] ? keySlot(typed[segs[1]], seg, caret, place) : null;
        if (key && i === 1) return keySlot(key, seg, caret, place);
        return null;
      }
      at += segs[i].length + 1;
    }
    return null;
  }
  // In the value.
  const vs = { text: m[3], start: spec.start + id.length + opLen };
  if (value === 'of') {
    const k = id.split('.').pop() ?? '';
    const values = place.lint.attributes.get(k) ?? (place.lint.ids.get('character_skin_layers')?.has(k) ? ['true', 'false'] : null);
    return values?.length ? { kind: 'words', start: vs.start, end: vs.start + vs.text.trimEnd().length, words: values, title: `${k} values` } : null;
  }
  return value && value !== 'number' ? valueSlot(value, vs, caret, place) : null;
}

function keySlot(spec: ValueSpec, p: Piece, caret: number, place: AssistPlace): Slot | null {
  return valueSlot(spec, p, caret, place);
}

// ---------------------------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------------------------

function groupOf(source: string | undefined): string {
  if (!source || source === 'builtin') return 'Built-in';
  if (source.startsWith('plugin:')) return `Plugin · ${source.slice(7)}`;
  if (source.startsWith('mod:')) return `Mod · ${source.slice(4)}`;
  if (source === 'game') return 'Game';
  if (source === 'script') return 'Scripts';
  if (source === 'header') return 'Header';
  if (source === 'choice') return 'Choice';
  return source;
}

function dungeonOf(place: AssistPlace, id: string): DungeonIndex | undefined {
  return id === place.lint.dungeonId ? place.self : place.lint.dungeons.get(id);
}

function allDungeons(place: AssistPlace): string[] {
  return [place.lint.dungeonId, ...place.lint.dungeons.keys()];
}

/** Every flag a dungeon's content writes into it. */
function flagsOf(place: AssistPlace, dungeon: string): Set<string> {
  const set = new Set<string>(dungeonOf(place, dungeon)?.flagWrites ?? []);
  for (const d of [place.self, ...place.lint.dungeons.values()]) for (const f of d.scopedFlagWrites.get(dungeon) ?? []) set.add(f);
  return set;
}

function refItems(ref: string, place: AssistPlace, token: string): { title: string; items: Candidate[] } {
  const lint = place.lint;
  const plain = (ids: Iterable<string>, group: string) => [...ids].map((id) => ({ text: id, label: id, group }));
  switch (ref) {
    case 'room': {
      const dot = token.indexOf('.');
      if (dot !== -1) {
        const d = token.slice(0, dot);
        return { title: `Rooms of ${d}`, items: [...(dungeonOf(place, d)?.rooms ?? [])].map((r) => ({ text: `${d}.${r}`, label: `${d}.${r}`, group: d })) };
      }
      return {
        title: 'Rooms',
        items: [...plain(place.self.rooms, 'This dungeon'), ...allDungeons(place).filter((d) => d !== lint.dungeonId).map((d) => ({ text: `${d}.`, label: `${d}.`, detail: 'another dungeon', group: 'Dungeons' }))],
      };
    }
    case 'dungeon': return { title: 'Dungeons', items: plain(allDungeons(place), 'Dungeons') };
    case 'flag': return { title: 'Flags', items: plain(flagsOf(place, lint.dungeonId), 'This dungeon') };
    case 'state': return { title: 'States', items: [...lint.vocab.states].map(([id, info]) => ({ text: id, label: id, group: groupOf(info.source) })) };
    case 'quest_log': {
      // `quest.goal.log` of this dungeon, or `dungeon.quest.goal.log` once another dungeon is typed.
      const d = token.split('.')[0];
      const prefixed = token.includes('.') ? dungeonOf(place, d) : undefined;
      const logs = (idx: DungeonIndex) => [...idx.templates].filter((t) => t.split('.').length === 3);
      const own = plain(logs(place.self), 'This dungeon');
      if (!prefixed) return { title: 'Quest logs', items: own };
      return { title: `Quest logs of ${d}`, items: [...logs(prefixed).map((t) => ({ text: `${d}.${t}`, label: `${d}.${t}`, group: d })), ...(d === lint.dungeonId ? [] : own)] };
    }
    case 'attribute': {
      const layers = lint.ids.get('character_skin_layers') ?? [];
      return { title: 'Attributes', items: [...plain(lint.attributes.keys(), 'Attributes'), ...plain(layers, 'Skin layers')] };
    }
  }
  const pool = ref in BUILTIN_LISTS ? new Set(BUILTIN_LISTS[ref]) : lint.ids.get(ref);
  const info = lint.info.get(ref);
  const group = refLabel(ref);
  return {
    title: group,
    items: [...(pool ?? [])].map((id) => {
      const i: EntryInfo | undefined = info?.get(id);
      return { text: id, label: id, group, detail: i?.name ?? (i?.template ? `from ${i.template}` : i?.source ? `made in ${i.source}` : undefined), image: i?.image, findByDetail: !!i?.name };
    }),
  };
}

/** Scene ids: bare names of this room, `&anchors`, and `room.scene` (every room once a dot is typed). */
function sceneItems(place: AssistPlace, token: string): Candidate[] {
  const out: Candidate[] = [{ text: 'next', label: 'next', detail: 'the next paragraph', group: 'Flow' }];
  const room = place.scope.room;
  const qualified = token.includes('.');
  if (room !== null && !qualified) for (const s of place.self.scenesByRoom.get(room) ?? []) out.push({ text: s, label: s, detail: `room ${room}`, group: 'This room' });
  for (const a of place.self.anchors) out.push({ text: `&${a}`, label: `&${a}`, group: 'Anchors' });
  for (const [r, scenes] of place.self.scenesByRoom) {
    if (r === room && !qualified) continue;
    for (const s of scenes) out.push({ text: `${r}.${s}`, label: `${r}.${s}`, group: r === room ? 'This room' : 'Other rooms' });
  }
  // `dungeon.room.scene` once another dungeon's id is typed.
  const d = token.split('.')[0];
  const other = d !== place.lint.dungeonId ? place.lint.dungeons.get(d) : undefined;
  if (other) for (const [r, scenes] of other.scenesByRoom) for (const s of scenes) out.push({ text: `${d}.${r}.${s}`, label: `${d}.${r}.${s}`, group: d });
  return out;
}

function keyItems(keys: Map<string, KeyEntry>, colon: boolean): Candidate[] {
  return [...keys].map(([k, v]) => {
    let after = '';
    let caretBack = 0;
    if (!colon) {
      const spec = v.value;
      if (spec && spec !== 'any' && stringForm(spec, '') !== null && accepts(spec, 'string')) { after = ': ""'; caretBack = 1; }
      else if (spec === 'boolean') after = ': true';
      else after = ': ';
    }
    return { text: k, after, caretBack, label: k, detail: v.help, help: v.help, examples: v.examples, group: groupOf(v.source) };
  });
}

function itemsFor(slot: Slot, place: AssistPlace, token: string): { title: string; items: Candidate[] } {
  const vocab = place.lint.vocab;
  switch (slot.kind) {
    case 'key': return { title: slot.title, items: keyItems(slot.keys, slot.colon) };
    case 'words': return { title: slot.title, items: slot.words.map((w) => ({ text: w, label: w, group: slot.title })) };
    case 'ref': {
      const r = refItems(slot.spec.ref, place, token);
      const words = (slot.words ?? []).map((w) => ({ text: w, label: w, group: 'Words' }));
      return { title: slot.spec.label ?? r.title, items: [...words, ...r.items] };
    }
    case 'scene': return { title: 'Scenes', items: sceneItems(place, token) };
    case 'condition-name': return { title: 'Conditions', items: [...vocab.conditions].map(([k, v]) => ({ text: k, label: k, detail: v.help, help: v.help, examples: v.examples, group: groupOf(v.source) })) };
    case 'flag': {
      const dot = token.indexOf('.');
      if (dot !== -1) {
        const d = token.slice(0, dot);
        return { title: `Flags of ${d}`, items: [...flagsOf(place, d)].map((f) => ({ text: `${d}.${f}`, label: `${d}.${f}`, group: d })) };
      }
      const here = [...flagsOf(place, place.lint.dungeonId), ...place.lint.scriptFlags].map((f) => ({ text: f, label: f, group: 'Flags' }));
      const conds = [...vocab.conditions].map(([k, v]) => ({ text: k, label: k, detail: v.help, help: v.help, group: 'Conditions' }));
      const dungeons = allDungeons(place).filter((d) => d !== place.lint.dungeonId).map((d) => ({ text: `${d}.`, label: `${d}.`, detail: 'another dungeon\'s flag', group: 'Dungeons' }));
      return { title: 'Flags', items: dedupe([...here, ...conds, ...dungeons]) };
    }
    case 'placeholder': return { title: 'Placeholders', items: [...vocab.placeholders].map(([k, v]) => ({ text: k, label: k, detail: v.help, help: v.help, examples: v.examples, group: groupOf(v.source) })) };
    case 'effect': return { title: 'Text effects', items: [...[...vocab.effects].map(([k, v]) => ({ text: k, label: k, group: groupOf(v.source) })), ...TEXT_COLORS.map((c) => ({ text: c, label: c, group: 'Colors' }))] };
    case 'template': return { title: 'Templates', items: [...place.self.templates].map((t) => ({ text: t, label: t, group: 'This dungeon' })) };
    case 'link': return refItems(slot.ref, place, token);
    case 'speaker': {
      const r = refItems('character', place, token);
      return { title: 'Speakers', items: r.items.map((i) => ({ ...i, after: ': ' })) };
    }
  }
}

function dedupe(items: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)));
}

/**
 * The matches for the typed token, grouped in the order the groups were offered (Built-in,
 * plugins, Game). Inside a group: an exact match, then names that start with the token, then
 * names that contain it, then display names that do; each alphabetical.
 */
function rank(items: Candidate[], token: string, limit = 200): Candidate[] {
  const t = token.toLowerCase();
  const order = new Map<string, number>();
  items.forEach((c) => { if (!order.has(c.group ?? '')) order.set(c.group ?? '', order.size); });
  const scored: Array<[Candidate, number]> = [];
  for (const c of items) {
    const l = c.label.toLowerCase();
    const score = !t || l === t ? 0 : l.startsWith(t) ? 1 : l.includes(t) ? 2 : c.findByDetail && c.detail?.toLowerCase().includes(t) ? 3 : -1;
    if (score >= 0) scored.push([c, score]);
  }
  scored.sort((a, b) => order.get(a[0].group ?? '')! - order.get(b[0].group ?? '')! || a[1] - b[1]
    || a[0].label.localeCompare(b[0].label, undefined, { sensitivity: 'base' }));
  return scored.slice(0, limit).map(([c]) => c);
}

/**
 * What can go at `caret`. `explicit` is the hotkey: it also offers speakers at a paragraph start.
 * Null when there is nothing to offer there.
 */
export function completeAt(text: string, caret: number, place: AssistPlace, explicit = false): Completion | null {
  const slot = slotAt(text, caret, place, explicit);
  if (!slot) return null;
  const token = text.slice(slot.start, caret);
  const { title, items } = itemsFor(slot, place, token);
  const ranked = rank(items, token);
  if (!ranked.length) return null;
  // Only the typed token itself is left: nothing more to offer.
  if (!explicit && ranked.length === 1 && ranked[0].text === text.slice(slot.start, slot.end) && !ranked[0].after) return null;
  return { start: slot.start, end: slot.end, title, items: ranked };
}

// ---------------------------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------------------------

function sourceLine(info: Partial<NameInfo> | undefined): string | undefined {
  if (!info?.source) return undefined;
  if (info.source === 'builtin') return 'Built into the engine';
  const where = info.file ? `${info.file.split('/').slice(-2).join('/')}${info.line ? `:${info.line}` : ''}` : '';
  return `${groupOf(info.source)}${where ? ` · ${where}` : ''}`;
}

/** What the id or name at `offset` is, for a hover card; null over anything else. */
export function describeAt(text: string, offset: number, place: AssistPlace): HoverInfo | null {
  const slot = slotAt(text, offset, place, true);
  if (!slot || offset < slot.start || offset > slot.end || slot.end <= slot.start) return null;
  const id = text.slice(slot.start, slot.end);
  const lint = place.lint;
  const vocab = lint.vocab;
  switch (slot.kind) {
    case 'key': {
      const k = slot.keys.get(id);
      if (!k) return null;
      return { id, kind: slot.title === 'Actions' ? 'Action' : 'Key', lines: [k.help, sourceLine(k)].filter(Boolean) as string[], examples: k.examples };
    }
    case 'condition-name': {
      const c = vocab.conditions.get(id);
      return c ? { id, kind: 'Condition', lines: [c.help, sourceLine(c)].filter(Boolean) as string[], examples: c.examples } : null;
    }
    case 'placeholder': {
      const c = vocab.placeholders.get(id.replace(/’/g, "'"));
      return c ? { id, kind: 'Placeholder', lines: [c.help, sourceLine(c)].filter(Boolean) as string[], examples: c.examples } : null;
    }
    case 'scene': return describeScene(id, place);
    case 'template': return place.self.templates.has(id) ? { id, kind: 'Template', lines: ['A $template of this dungeon'], jump: { kind: 'template', dungeon: lint.dungeonId, id } } : null;
    case 'flag': {
      if (id.startsWith('_')) return null;
      const dot = id.indexOf('.');
      const d = dot === -1 ? lint.dungeonId : id.slice(0, dot);
      const name = dot === -1 ? id : id.slice(dot + 1);
      const set = flagsOf(place, d).has(name);
      return { id, kind: 'Flag', lines: [set ? `Set by content in ${d}` : lint.scriptFlags.has(id) ? 'Set by a script' : `Not set anywhere in ${d} yet`] };
    }
    case 'speaker': return describeRef('character', id, place, 'Speaker');
    case 'effect': {
      const e = vocab.effects.get(id);
      if (e) return { id, kind: 'Text effect', lines: [sourceLine(e) ?? ''].filter(Boolean) };
      return (TEXT_COLORS as readonly string[]).includes(id) ? { id, kind: 'Text color', lines: [] } : null;
    }
    case 'link': return describeRef(slot.ref, id, place);
    case 'ref': {
      if (slot.words?.includes(id)) return null;
      const ref = slot.spec.ref;
      if (ref === 'room') {
        const dot = id.indexOf('.');
        const d = dot === -1 ? lint.dungeonId : id.slice(0, dot);
        const room = dot === -1 ? id : id.slice(dot + 1);
        return dungeonOf(place, d)?.rooms.has(room) ? { id, kind: 'Room', lines: [`In dungeon ${d}`], jump: { kind: 'room', dungeon: d, room } } : null;
      }
      if (ref === 'dungeon') return dungeonOf(place, id) ? { id, kind: 'Dungeon', lines: [] } : null;
      if (ref === 'quest_log') {
        const parts = id.replace(/^\$/, '').split('.');
        const d = parts.length === 4 ? parts[0] : lint.dungeonId;
        const t = parts.slice(-3).join('.');
        return dungeonOf(place, d)?.templates.has(t)
          ? { id, kind: 'Quest log', lines: [d === lint.dungeonId ? 'A $template of this dungeon' : `A $template of ${d}`], jump: { kind: 'template', dungeon: d, id: t } }
          : null;
      }
      if (ref === 'flag' || ref === 'attribute') return null;
      if (ref === 'state') { const s = vocab.states.get(id); return s ? { id, kind: 'State', lines: [sourceLine(s) ?? ''].filter(Boolean) } : null; }
      return describeRef(ref, id, place, slot.spec.label);
    }
    default: return null;
  }
}

function describeRef(ref: string, id: string, place: AssistPlace, label?: string): HoverInfo | null {
  const pool = ref in BUILTIN_LISTS ? new Set(BUILTIN_LISTS[ref]) : place.lint.ids.get(ref);
  if (!pool?.has(id)) return null;
  const info = place.lint.info.get(ref)?.get(id);
  const lines: string[] = [];
  if (info?.template) lines.push(`An instance of the template ${info.template}`);
  if (info?.source) lines.push(`Created in ${info.source}`);
  // Characters jump to their template's entry; ids made at runtime have none.
  const entityRef = ref === 'character' || ref === 'character_template' ? 'character_templates' : ref;
  const entityId = info?.template ?? id;
  const jumpable = !(ref in BUILTIN_LISTS) && !info?.source;
  return {
    id, kind: label ?? refLabel(ref), name: info?.name, image: info?.image, lines,
    ...(jumpable ? { jump: { kind: 'entity', ref: entityRef, id: entityId } as JumpTarget } : {}),
  };
}

function describeScene(v: string, place: AssistPlace): HoverInfo | null {
  const lint = place.lint;
  if (v.startsWith('&')) {
    const parts = v.slice(1).split('.');
    const d = parts.length === 2 ? parts[0] : lint.dungeonId;
    const name = parts[parts.length - 1];
    return dungeonOf(place, d)?.anchors.has(name) ? { id: v, kind: 'Anchor', lines: [d === lint.dungeonId ? 'In this dungeon' : `In dungeon ${d}`], jump: { kind: 'anchor', dungeon: d, name } } : null;
  }
  const parts = v.split('.').map((x) => x.replace(/^#/, ''));
  let d = lint.dungeonId;
  let room: string | null = place.scope.room;
  let scene = parts[0];
  if (parts.length === 2 || parts.length === 5) { room = parts[0]; scene = parts[1]; }
  else if (parts.length === 3 || parts.length === 6) { d = parts[0]; room = parts[1]; scene = parts[2]; }
  if (room === null) return null;
  const has = dungeonOf(place, d)?.scenesByRoom.get(room)?.has(scene);
  return has ? { id: v, kind: 'Scene', lines: [`Room ${room}${d === lint.dungeonId ? '' : ` of ${d}`}`], jump: { kind: 'scene', dungeon: d, room, scene } } : null;
}
