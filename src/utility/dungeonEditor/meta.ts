import { jsonrepair } from 'jsonrepair';
import { isCommentLine, stripCodeBlocks } from './comments';

/**
 * The `__meta` channel — editor-only authoring state carried inside a block's
 * own `{…}` params.
 *
 * It rides in params rather than in a `//` line because params already
 * round-trip byte-identically for every carrier the editor has (block headers,
 * `!choice` rows, `~name` columns) with no parser change, while a comment has
 * no structural slot under a `#scene` or `^room` header.
 *
 * The engine must never see it: `stripMeta` runs in the save path that builds
 * `content_parsed.json` (editor.ts). That strip is load-bearing — `^` is absent
 * from `parseText`'s brace-strip list (functions.ts), so an un-stripped room
 * param becomes part of `room_id` and renames every id beneath it.
 *
 * Double underscore is deliberate: single `_` is the author's own flag-naming
 * convention (`_bellySize`, `_ropeUsed`, …), while `__` is already the engine's
 * internal-reserved prefix (`__dot__`, `__order`, `__description_attach`).
 */

export const META_KEY = '__meta';

/** Author-set state. Distinct from lint severity, which is machine-derived. */
export type MetaStatus = 'todo' | 'wip' | 'done' | 'broken';

export const META_STATUSES: MetaStatus[] = ['todo', 'wip', 'done', 'broken'];

export const META_STATUS_ICON: Record<MetaStatus, string> = {
  todo: 'pi pi-circle',
  wip: 'pi pi-clock',
  done: 'pi pi-check',
  broken: 'pi pi-exclamation-circle',
};

export const META_STATUS_LABEL: Record<MetaStatus, string> = {
  todo: 'Todo',
  wip: 'In progress',
  done: 'Done',
  broken: 'Broken',
};

export function isMetaStatus(v: unknown): v is MetaStatus {
  return typeof v === 'string' && (META_STATUSES as string[]).includes(v);
}

/**
 * How one scene row arranges its `%`/`~` columns in the editor.
 *
 * Absent means columns: the row's `%`/`~` sections sit side by side as lanes,
 * which is how a `~` branch row reads — the choices next to each other rather
 * than one scrolling past the other, and how the grid was drawn in the
 * documents this format came from.
 *
 * `rows` is the opt-out: every column becomes a full-width band stacked top
 * to bottom, for a row whose one section carries a long passage of prose.
 *
 * Presentation only. It rides in the same `__meta` blob as `status` and is
 * stripped before the runtime sees the line.
 */
export type MetaLayout = 'rows';

export function isMetaLayout(v: unknown): v is MetaLayout {
  return v === 'rows';
}

/**
 * Open by design: `status` is all the UI renders today, but the blob is the
 * extension point — tags, a checked date, an owner — cost no format change and
 * no migration, so nothing here validates unknown keys away.
 */
export type BlockMeta = {
  status?: MetaStatus;
  /** Scene rows only — blocks have no columns to lay out. */
  layout?: MetaLayout;
  [key: string]: unknown;
};

// --- string-aware scanning -------------------------------------------------
// Params are hand-authored and may contain braces inside string values
// (`{note:"use {flash} here"}`), so every walk below tracks strings. A regex
// cannot do this correctly, and the failure mode of getting it wrong is a
// silently corrupted runtime id rather than a visible error.

/**
 * Straighten smart quotes so the scanners see one quote vocabulary. The
 * substitution is same-length, so every offset computed over the result is an
 * offset into the input — the same trick `validateParamsJsonAt` uses. This is
 * not cosmetic: the author's params quote with curly pairs throughout
 * (`view: “Predators of the Wilds”`), and an opening/closing pair that
 * differ would never match a same-character scan.
 */
function normalizeQuotes(s: string): string {
  return s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function skipString(s: string, i: number): number {
  const quote = s[i];
  i++;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === quote) return i + 1;
    i++;
  }
  return i;
}

/** End offset (exclusive) of the value starting at `i`. */
function skipValue(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  const c = s[i];
  if (c === '"' || c === "'") return skipString(s, i);
  if (c === '{' || c === '[') {
    const close = c === '{' ? '}' : ']';
    let depth = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"' || ch === "'") { i = skipString(s, i); continue; }
      if (ch === c) depth++;
      else if (ch === close) { depth--; if (depth === 0) return i + 1; }
      i++;
    }
    return i;
  }
  while (i < s.length && s[i] !== ',' && s[i] !== '}' && s[i] !== ']') i++;
  return i;
}

/** Offsets of the outermost balanced `{…}` in `line`, or null. */
function braceSpan(raw: string): [number, number] | null {
  const line = normalizeQuotes(raw);
  const open = line.indexOf('{');
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    const c = line[i];
    if (c === '"' || c === "'") { i = skipString(line, i) - 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return [open, i + 1]; }
  }
  return null;
}

type MetaSpan = {
  /** Start of the `__meta` key token. */
  entryStart: number;
  /** Start of its value. */
  valueStart: number;
  /** End of its value (exclusive). */
  valueEnd: number;
  /** End of the entry before it (exclusive), for comma trimming. */
  prevEnd: number;
  /** Whether any other key exists in the object. */
  hasSiblings: boolean;
};

/** Outcome of scanning one params object. */
type ScanResult = {
  meta: MetaSpan | null;
  /** An entry could not be parsed, so the object's shape is not trustworthy. */
  malformed: boolean;
};

/**
 * Advance past an unparseable entry to the start of the next one.
 *
 * Without this a single broken sibling (`{music}` — a key with no colon, which
 * the linter already flags) would hide a perfectly good `__meta` from every
 * operation: `readMeta` would report no status, `stripMeta` would leave the
 * key for the engine, and `writeMeta` would append a SECOND `__meta` on every
 * click.
 */
function skipToNextEntry(s: string, i: number, end: number): number {
  let depth = 0;
  while (i < end) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i); continue; }
    if (c === '{' || c === '[') depth++;
    // A top-level `}` ends the object, so stop on it. A top-level `]` is a
    // stray closer with no opener — it must be STEPPED OVER, not returned:
    // returning it leaves the caller's index unmoved and the two loops spin
    // forever, wedging the editor on a single mistyped bracket.
    else if (c === '}') { if (depth === 0) return i; depth--; }
    else if (c === ']') { if (depth === 0) { i++; continue; } depth--; }
    else if (c === ',' && depth === 0) return i + 1;
    i++;
  }
  return i;
}

/** Locate a top-level `__meta` entry inside the object at `[open, end)`. */
function scanParams(rawIn: string, open: number, end: number): ScanResult {
  const raw = normalizeQuotes(rawIn);
  let i = open + 1;
  let prevEnd = open + 1;
  let found: Omit<MetaSpan, 'hasSiblings'> | null = null;
  let siblings = 0;
  let malformed = false;
  while (i < end) {
    while (i < end && (/\s/.test(raw[i]) || raw[i] === ',')) i++;
    if (i >= end || raw[i] === '}') break;
    // A stray `]` at top level: the key scan cannot consume it, so stepping
    // over it is what keeps the loop moving. Do NOT break here — a `__meta`
    // sitting after the bracket would then be invisible to `readMeta` and
    // `stripMeta`, and every click would append another one. Flagging it
    // malformed is what stops `writeMeta` from appending into a broken object.
    if (raw[i] === ']') { malformed = true; i++; continue; }
    const entryStart = i;
    let key: string;
    if (raw[i] === '"' || raw[i] === "'") {
      const e = skipString(raw, i);
      key = raw.slice(i + 1, e - 1);
      i = e;
    } else {
      const ks = i;
      while (i < end && /[A-Za-z0-9_.$]/.test(raw[i])) i++;
      key = raw.slice(ks, i);
    }
    while (i < end && /\s/.test(raw[i])) i++;
    if (raw[i] !== ':') {
      malformed = true;
      i = skipToNextEntry(raw, i, end);
      prevEnd = i;
      continue;
    }
    i++;
    const valueStart = i;
    const valueEnd = skipValue(raw, i);
    if (valueEnd <= valueStart || valueEnd >= end) {
      malformed = true;
      i = skipToNextEntry(raw, i, end);
      prevEnd = i;
      continue;
    }
    if (key === META_KEY) found = { entryStart, valueStart, valueEnd, prevEnd };
    else siblings++;
    prevEnd = valueEnd;
    i = valueEnd;
  }
  return { meta: found ? { ...found, hasSiblings: siblings > 0 } : null, malformed };
}

// --- read / write ----------------------------------------------------------

/** The `__meta` object carried by `paramsRaw`, or null when there is none. */
export function readMeta(paramsRaw: string | undefined | null): BlockMeta | null {
  if (!paramsRaw || !paramsRaw.includes(META_KEY)) return null;
  const span = braceSpan(paramsRaw);
  if (!span) return null;
  const meta = scanParams(paramsRaw, span[0], span[1]).meta;
  if (!meta) return null;
  const rawValue = normalizeQuotes(paramsRaw.slice(meta.valueStart, meta.valueEnd)).trim();
  try {
    const parsed = JSON.parse(jsonrepair(rawValue));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as BlockMeta : null;
  } catch {
    return null;
  }
}

/** True when the blob carries nothing worth writing. */
function isEmptyMeta(meta: BlockMeta | null): boolean {
  if (!meta) return true;
  for (const k in meta) {
    const v = meta[k];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return false;
  }
  return true;
}

/**
 * Serialize with unquoted keys and quoted string values — the dialect the
 * author already writes everywhere (2393 unquoted keys vs 0 quoted) and the
 * one the linter accepts. Quoting the keys here would make `__meta` the only
 * quoted object in the file.
 */
function serializeMeta(meta: BlockMeta): string {
  const parts: string[] = [];
  for (const k in meta) {
    const v = meta[k];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    parts.push(`${k}:${encodeValue(v)}`);
  }
  return `{${parts.join(',')}}`;
}

/**
 * `JSON.stringify`, but with curly quotes \u-escaped rather than literal.
 *
 * Everything that reads params — `normalizeQuotes` here, and
 * `validateParamsJsonAt` in the linter — straightens curly quotes to `"` so
 * it can cope with the author's dialect. A literal curly quote inside a note
 * would therefore close the string early and report a spurious params error
 * on the block. The author types these constantly (their prose is full of
 * them), so the escape is not a corner case.
 */
function encodeValue(v: unknown): string {
  return JSON.stringify(v).replace(
    /[\u2018\u2019\u201c\u201d]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

/**
 * Return `paramsRaw` with `__meta` set to `meta` (or removed when empty).
 * Every other byte of the author's params — spacing, key order, quoting — is
 * preserved, so toggling a status never reformats hand-written params.
 */
export function writeMeta(paramsRaw: string | undefined, meta: BlockMeta | null): string | undefined {
  const empty = isEmptyMeta(meta);

  // Nothing there yet — safe to author a fresh object.
  if (!paramsRaw || paramsRaw.trim() === '') {
    return empty ? paramsRaw : `{${META_KEY}:${serializeMeta(meta!)}}`;
  }

  const span = braceSpan(paramsRaw);
  // Params the author typed that we cannot parse (unbalanced braces, an
  // unquoted value containing an apostrophe, …). Editing blind would throw
  // their text away, so decline — the linter is already flagging the line.
  if (!span) return paramsRaw;

  const [open, end] = span;
  const { meta: existing, malformed } = scanParams(paramsRaw, open, end);

  if (existing) {
    if (!empty) {
      return paramsRaw.slice(0, existing.valueStart) + serializeMeta(meta!) + paramsRaw.slice(existing.valueEnd);
    }
    const cut = cutRange(paramsRaw, existing, end);
    const next = paramsRaw.slice(0, cut[0]) + paramsRaw.slice(cut[1]);
    // An object that held nothing but `__meta` disappears entirely, so a
    // cleared block is byte-identical to one that never carried meta.
    return /^\s*\{\s*\}\s*$/.test(next) ? undefined : next;
  }

  if (empty) return paramsRaw;
  // No `__meta`, but at least one entry was unreadable — we cannot tell where
  // a new key would legally go, and appending blind stacks duplicates.
  if (malformed) return paramsRaw;
  const inner = paramsRaw.slice(open + 1, end - 1);
  const sep = inner.trim() === '' ? '' : ', ';
  return paramsRaw.slice(0, end - 1) + sep + META_KEY + ':' + serializeMeta(meta!) + paramsRaw.slice(end - 1);
}

/** Range to delete for a `__meta` entry, absorbing exactly one adjacent comma. */
function cutRange(raw: string, meta: MetaSpan, end: number): [number, number] {
  if (!meta.hasSiblings) return [meta.entryStart, meta.valueEnd];
  // Prefer eating the comma before us; fall back to the one after.
  const before = raw.slice(meta.prevEnd, meta.entryStart);
  if (before.includes(',')) return [meta.prevEnd, meta.valueEnd];
  let after = meta.valueEnd;
  while (after < end && /\s/.test(raw[after])) after++;
  if (raw[after] === ',') {
    // Take the separator's trailing space too, so removing a leading `__meta`
    // leaves `{cooldown:3}` rather than `{ cooldown:3}`.
    let cut = after + 1;
    while (cut < end && (raw[cut] === ' ' || raw[cut] === '\t')) cut++;
    return [meta.entryStart, cut];
  }
  return [meta.entryStart, meta.valueEnd];
}

// --- editor display -------------------------------------------------------

/**
 * `paramsRaw` as the author should SEE it, with the `__meta` entry removed.
 *
 * The params box is for the author's own engine params; `__meta` is editor
 * bookkeeping and reads as noise (and as something to "clean up") when it
 * shows up there. The full string, meta included, is still what the Raw view
 * and `content_raw.txt` hold.
 */
export function visibleParams(paramsRaw: string | undefined): string {
  return writeMeta(paramsRaw, null) ?? '';
}

/**
 * The span `visibleParams` removes, or null when there is nothing to remove.
 *
 * The linter validates the FULL params string (that is what lands on disk), so
 * its anchors are offsets into it — but the params box shows the meta-free
 * string. Anything mapping one to the other goes through this.
 */
export function metaCutSpan(paramsRaw: string | undefined): [number, number] | null {
  if (!paramsRaw || !paramsRaw.includes(META_KEY)) return null;
  const span = braceSpan(paramsRaw);
  if (!span) return null;
  const meta = scanParams(paramsRaw, span[0], span[1]).meta;
  if (!meta) return null;
  return cutRange(paramsRaw, meta, span[1]);
}

/**
 * Re-attach `meta` to params the author just typed, so editing the (meta-free)
 * params box never drops the block's status.
 *
 * Takes the meta itself rather than the stored string: mid-edit the params are
 * transiently unparseable (`{if:"x` between keystrokes), `writeMeta` rightly
 * declines to touch those, and the caller has to hold the meta across that gap
 * rather than re-read it from a string that no longer carries it.
 */
export function mergeAuthoredParams(typed: string, meta: BlockMeta | null): string | undefined {
  return writeMeta(typed.trim() === '' ? undefined : typed, meta);
}

// --- build-path strip ------------------------------------------------------

/**
 * Remove the `__meta` entry from one line's params, preserving every other byte.
 *
 * `scan` is the string the offsets are computed over; it defaults to `line`
 * but may be a same-length masked copy (see `stripMeta`), so a `[code]` span
 * sharing the line cannot be mistaken for params.
 */
export function stripMetaFromLine(line: string, scan: string = line): string {
  const span = braceSpan(scan);
  if (!span) return line;
  const meta = scanParams(scan, span[0], span[1]).meta;
  if (!meta) return line;
  const cut = cutRange(scan, meta, span[1]);
  let next = line.slice(0, cut[0]) + line.slice(cut[1]);
  let nextScan = scan.slice(0, cut[0]) + scan.slice(cut[1]);
  // `{}` left behind by a meta-only param object would still be stripped by
  // parseText for `@!$#`, but on a `^room` header it becomes part of the id.
  const emptied = braceSpan(nextScan);
  if (emptied && /^\{\s*\}$/.test(nextScan.slice(emptied[0], emptied[1]))) {
    next = next.slice(0, emptied[0]) + next.slice(emptied[1]);
  }
  return next;
}

/**
 * Strip every `__meta` entry from a raw dungeon document, on the way to
 * `parseText`.
 *
 * Deliberately line-local: routing this through `parseToAst`/`serializeAst`
 * would normalize blank lines, and blank lines drive `scene_paragraph`
 * numbering in `parseText`, so that would silently renumber runtime ids.
 *
 * Code spans are excluded via `stripCodeBlocks`, which blanks them to spaces
 * without changing length — so offsets still map, and the decision is made per
 * line from the mask. A latch driven by "does this line mention `[code]`"
 * would be flipped by the text `[code]` inside a note, which would then
 * silently disable stripping for the whole rest of the file.
 */
export function stripMeta(text: string): string {
  if (!text || !text.includes(META_KEY)) return text;
  // parseText replaces \v with \n before it splits, so split the same way or
  // a `__meta` after a \v would be scanned as part of the wrong line.
  const normalized = text.replace(/\v/g, '\n');
  const lines = normalized.split('\n');
  const masked = stripCodeBlocks(normalized).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const scan = masked[i] ?? '';
    // A commented-out param object is not a param object.
    if (isCommentLine(scan)) continue;
    if (!scan.includes(META_KEY)) continue;
    lines[i] = stripMetaFromLine(lines[i], scan);
  }
  return lines.join('\n');
}
