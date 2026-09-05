import type { Document } from './ast';
import { isCommentLine, stripCodeBlocks, stripCommentLinesMapped } from './comments';
import { anchorLineInBlock, blockStartLines } from './locate';

/**
 * Which editable inside a block card an issue points at. The editor uses it
 * to focus the exact input / textarea instead of the whole card.
 */
export type IssueTarget =
  | 'header-params'   // block header `{params}` input
  | 'row-params'      // `!choice{params}` input of an encounter/template row
  | 'row-text'        // a struct row's own textarea (code rows)
  | 'prose'           // the merged prose textarea of an encounter/template
  | 'column-params'   // `~name{params}` input of a scene column
  | 'column-content'  // a scene column's content textarea
  | 'raw';            // a raw block's textarea

export type IssueAnchor = {
  target: IssueTarget;
  /** Encounter/template row index, or scene row index. */
  rowIndex?: number;
  /** Scene column index. */
  colIndex?: number;
  /**
   * Character range inside the target's own text, in model coordinates
   * (highlight markup included — the editor maps it to what it displays).
   */
  start?: number;
  end?: number;
};

export type LintIssue = {
  blockIndex: number;
  field?: 'paramsRaw' | 'content' | 'header';
  severity: 'error' | 'warning';
  message: string;
  /** 1-based line in the serialized dungeon text (what the Raw view shows). */
  line: number;
  at?: IssueAnchor;
};

/** Every balanced `{…}` substring (nested braces supported). */
export function findBraceRanges(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      if (depth === 0) continue;
      depth--;
      if (depth === 0 && start !== -1) {
        out.push([start, i + 1]);
        start = -1;
      }
    }
  }
  return out;
}

/** Offsets of every `{` that never closes and every `}` that never opened. */
export function findUnmatchedBraces(s: string): { opens: number[]; closes: number[] } {
  const opens: number[] = [];
  const closes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') opens.push(i);
    else if (c === '}') {
      if (opens.length) opens.pop();
      else closes.push(i);
    }
  }
  return { opens, closes };
}

function findUnmatchedCodeTags(s: string): { opens: number[]; closes: number[] } {
  const opens: number[] = [];
  const closes: number[] = [];
  const re = /\[(\/?)code\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) {
      if (opens.length) opens.pop();
      else closes.push(m.index);
    } else {
      opens.push(m.index);
    }
  }
  return { opens, closes };
}

function lineEndAfter(s: string, from: number): number {
  const nl = s.indexOf('\n', from);
  return nl === -1 ? s.length : nl;
}

export type ParamsError = { message: string; at: number };

/**
 * Validate a `{…}` params string.
 *
 * Rules (matching the engine's `jsonrepair` leniency):
 * - Keys can be unquoted identifiers (engine handles these).
 * - Values MUST be one of: quoted string, number, boolean, null, nested object, nested array.
 * - Unquoted identifier values are rejected (ambiguous — author probably meant a string).
 * - Missing `:` between key and value is rejected.
 * - Unbalanced braces / unclosed strings are rejected.
 *
 * Returns `null` when valid, otherwise the error plus the offset it was
 * detected at (an index into `raw`).
 */
export function validateParamsJsonAt(raw: string): ParamsError | null {
  // Same-length substitutions, so offsets in `s` are offsets in `raw`.
  const s = raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (!s.trim().startsWith('{')) return { message: `expected '{' at start`, at: 0 };

  let i = 0;
  const skipWs = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const fail = (message: string, at: number = i): ParamsError => ({ message, at: Math.min(at, Math.max(0, s.length - 1)) });

  const readString = (): ParamsError | null => {
    const openedAt = i;
    const quote = s[i]; i++;
    while (i < s.length && s[i] !== quote) {
      if (s[i] === '\\') i++;
      i++;
    }
    if (i >= s.length) return fail(`unclosed string`, openedAt);
    i++;
    return null;
  };

  const readIdentifier = () => {
    while (i < s.length && /[a-zA-Z0-9_.$]/.test(s[i])) i++;
  };

  const readNumber = () => {
    while (i < s.length && /[-+0-9.eE]/.test(s[i])) i++;
  };

  const context = (at: number) => s.slice(at, Math.min(s.length, at + 10));

  const parseObject = (): ParamsError | null => {
    if (s[i] !== '{') return fail(`expected '{' near '${context(i)}'`);
    const openedAt = i;
    i++;
    skipWs();
    if (s[i] === '}') { i++; return null; }
    while (i < s.length) {
      skipWs();
      // Key
      if (s[i] === '"' || s[i] === "'") {
        const err = readString(); if (err) return err;
      } else if (/[a-zA-Z_$]/.test(s[i] ?? '')) {
        readIdentifier();
      } else {
        return fail(`expected key near '${context(i)}'`);
      }
      skipWs();
      // Colon
      if (s[i] !== ':') return fail(`expected ':' near '${context(i)}'`);
      i++;
      skipWs();
      // Value
      const vErr = parseValue(); if (vErr) return vErr;
      skipWs();
      if (i >= s.length) return fail(`unclosed '{'`, openedAt);
      if (s[i] === ',') { i++; skipWs(); if (s[i] === '}') { i++; return null; } continue; }
      if (s[i] === '}') { i++; return null; }
      return fail(`expected ',' or '}' near '${context(i)}'`);
    }
    return fail(`unclosed '{'`, openedAt);
  };

  const parseArray = (): ParamsError | null => {
    if (s[i] !== '[') return fail(`expected '[' near '${context(i)}'`);
    const openedAt = i;
    i++;
    skipWs();
    if (s[i] === ']') { i++; return null; }
    while (i < s.length) {
      skipWs();
      const vErr = parseValue(); if (vErr) return vErr;
      skipWs();
      if (i >= s.length) return fail(`unclosed '['`, openedAt);
      if (s[i] === ',') { i++; skipWs(); if (s[i] === ']') { i++; return null; } continue; }
      if (s[i] === ']') { i++; return null; }
      return fail(`expected ',' or ']' near '${context(i)}'`);
    }
    return fail(`unclosed '['`, openedAt);
  };

  const parseValue = (): ParamsError | null => {
    const c = s[i];
    if (c === undefined) return fail(`missing value`);
    if (c === '"' || c === "'") return readString();
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '-' || /[0-9]/.test(c)) { readNumber(); return null; }
    const rest = s.slice(i);
    const kw = rest.match(/^(true|false|null)\b/);
    if (kw) { i += kw[0].length; return null; }
    return fail(`unquoted value near '${context(i)}' — wrap strings in quotes`);
  };

  skipWs();
  const err = parseObject();
  if (err) return err;
  skipWs();
  if (i < s.length) return fail(`unexpected content after '}'`);
  return null;
}

/** `validateParamsJsonAt` without the position — `null` when valid. */
export function validateParamsJson(raw: string): string | null {
  return validateParamsJsonAt(raw)?.message ?? null;
}

/** Turns a range in some scanned text into the anchor the editor can focus. */
type Locator = (start: number, end: number) => IssueAnchor;

export function lintDungeonContent(_source: string, doc: Document): LintIssue[] {
  const issues: LintIssue[] = [];

  // `line` is filled in once every block has been visited, so pushes only
  // need the anchor.
  const push = (issue: Omit<LintIssue, 'line'>) => {
    issues.push({ ...issue, line: 0 });
  };

  const validateBraceSubstrings = (idx: number, text: string, field: LintIssue['field'], at: Locator) => {
    for (const [start, end] of findBraceRanges(text)) {
      const segment = text.slice(start, end);
      const preview = segment.length > 30 ? segment.slice(0, 27) + '…' : segment;
      // Blank line inside a `{…}` breaks the game parser: in encounters/templates
      // it inserts `<br>` into the concatenated body, in scenes it starts a new
      // paragraph. Either way the JSON is split.
      const blank = /\n[ \t]*\n/.exec(segment);
      if (blank) {
        push({
          blockIndex: idx,
          field,
          severity: 'error',
          message: `Empty line inside '${preview}' — game engine treats blank lines as paragraph breaks`,
          at: at(start, end),
        });
        continue;
      }
      // `if{…}` / `ifOr{…}` / `else{…}` / `fi{…}` use a condition syntax
      // (`flag_name = value, …`) that isn't JSON — skip the strict validator.
      // Longest keywords first so `ifOr` wins over `if`.
      let isCondition = false;
      for (const kw of ['ifOr', 'else', 'if', 'fi']) {
        const kwStart = start - kw.length;
        if (kwStart >= 0 && text.substring(kwStart, start) === kw) {
          const prev = kwStart > 0 ? text[kwStart - 1] : '';
          if (!/\w/.test(prev)) {
            isCondition = true;
            break;
          }
        }
      }
      if (isCondition) continue;
      const err = validateParamsJsonAt(segment);
      if (err) {
        push({
          blockIndex: idx,
          field,
          severity: 'error',
          message: `Invalid '${preview}': ${err.message}`,
          at: at(start, end),
        });
      }
    }
  };

  const check = (idx: number, text: string, field: LintIssue['field'], locate: Locator) => {
    if (!text) return;
    // The engine drops `//` lines outright, so anything on one is not content:
    // a commented-out `{…}` must not be brace-scanned or JSON-validated. The
    // mapping brings scanner offsets back to the text the editor displays.
    const { text: live, toOriginal } = stripCommentLinesMapped(text);
    if (!live.trim()) return;
    const at: Locator = (s, e) => locate(toOriginal(s), toOriginal(e));

    const codeTags = findUnmatchedCodeTags(live);
    if (codeTags.closes.length) {
      const p = codeTags.closes[0];
      push({
        blockIndex: idx,
        field,
        severity: 'error',
        message: `Unmatched [/code] (${codeTags.closes.length})`,
        at: at(p, p + '[/code]'.length),
      });
    }
    if (codeTags.opens.length) {
      const p = codeTags.opens[0];
      push({
        blockIndex: idx,
        field,
        severity: 'error',
        message: `Unclosed [code] block (${codeTags.opens.length})`,
        at: at(p, p + '[code]'.length),
      });
    }
    // Brace scans ignore anything inside `[code]…[/code]` — those blocks are
    // literal raw passthrough and may contain `{` / `}` that aren't real params.
    const sanitized = stripCodeBlocks(live);
    const braces = findUnmatchedBraces(sanitized);
    if (braces.closes.length) {
      const p = braces.closes[0];
      push({
        blockIndex: idx,
        field,
        severity: 'error',
        message: `Unmatched '}' (${braces.closes.length})`,
        at: at(p, lineEndAfter(sanitized, p)),
      });
    }
    if (braces.opens.length) {
      const p = braces.opens[0];
      push({
        blockIndex: idx,
        field,
        severity: 'error',
        message: `Unclosed '{' (${braces.opens.length} unmatched)`,
        at: at(p, lineEndAfter(sanitized, p)),
      });
    }
    validateBraceSubstrings(idx, sanitized, field, at);
  };

  const checkParams = (idx: number, text: string, field: LintIssue['field'], at: Locator) => {
    if (!text) return;
    const codeTags = findUnmatchedCodeTags(text);
    if (codeTags.closes.length) {
      const p = codeTags.closes[0];
      push({ blockIndex: idx, field, severity: 'error', message: `Unmatched [/code] (${codeTags.closes.length})`, at: at(p, p + '[/code]'.length) });
    }
    if (codeTags.opens.length) {
      const p = codeTags.opens[0];
      push({ blockIndex: idx, field, severity: 'error', message: `Unclosed [code] block (${codeTags.opens.length})`, at: at(p, p + '[code]'.length) });
    }
    // paramsRaw is always the whole object (extracted by parser); validate it in one shot.
    const err = validateParamsJsonAt(text);
    if (err) {
      push({ blockIndex: idx, field, severity: 'error', message: `Invalid params: ${err.message}`, at: at(err.at, err.at + 1) });
    }
  };

  // A `>` inline choice binds to the paragraph above it. Lines that never emit a
  // paragraph — anchors, comments, row numbers, other choices — can't be bound to.
  const emitsParagraph = (line: string): boolean => {
    // An indented `  // note` is prose to the engine, not a comment, so it does
    // emit a paragraph — hence the untrimmed test.
    if (isCommentLine(line)) return false;
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('>') || t.startsWith('&')) return false;
    if (/^\d+$/.test(t)) return false;
    return true;
  };

  const checkInlineChoices = (idx: number, content: string, locate: Locator) => {
    const lines = content.split('\n');
    let hasParagraph = false;
    let offset = 0;
    for (const line of lines) {
      if (line.trimStart().startsWith('>')) {
        if (!hasParagraph) {
          push({
            blockIndex: idx,
            field: 'content',
            severity: 'error',
            message: `Inline choice '${line.trim().slice(0, 30)}' has no paragraph above it to attach to — it can never be reached`,
            at: locate(offset, offset + line.length),
          });
        }
      } else if (emitsParagraph(line)) {
        hasParagraph = true;
      }
      offset += line.length + 1;
    }
  };

  doc.blocks.forEach((block, idx) => {
    // serializeAst skips falsy entries; mirror it rather than crash on one.
    if (!block) return;
    if (block.kind === 'raw') {
      check(idx, block.text, 'content', (start, end) => ({ target: 'raw', start, end }));
      return;
    }

    if ('paramsRaw' in block && block.paramsRaw) {
      checkParams(idx, block.paramsRaw, 'paramsRaw', (start, end) => ({ target: 'header-params', start, end }));
    }

    if (block.kind === 'encounter' || block.kind === 'template') {
      // Join every text-like row into a single string before scanning, so
      // multi-line `{…}` blocks (one line per row after parsing) are treated
      // as one balanced expression by the brace + params-substring checks.
      // This is the same merge the block card shows in its prose textarea,
      // so offsets into it are offsets the card can focus.
      const proseLines: string[] = [];
      let proseOffset = 0;
      block.rows.forEach((row, rowIndex) => {
        const proseStart = proseOffset;
        if (row.kind === 'text') proseLines.push(row.text);
        else if (row.kind === 'empty') proseLines.push('');
        else if (row.kind === 'comment') proseLines.push(row.text);
        else if (row.kind === 'code') {
          check(idx, row.text, 'content', (start, end) => ({ target: 'row-text', rowIndex, start, end }));
        } else if (row.kind === 'choice' && row.paramsRaw) {
          checkParams(idx, row.paramsRaw, 'content', (start, end) => ({ target: 'row-params', rowIndex, start, end }));
        }
        if (row.kind === 'text' || row.kind === 'empty' || row.kind === 'comment') {
          proseOffset += proseLines[proseLines.length - 1].length + 1;
        }

        // `>` is scene-only: the parser still emits a line for it here, but with the
        // scene row/block/paragraph counters left over from whatever came before, so
        // the id points nowhere. Encounters use `!`.
        if (row.kind === 'text' && row.text.trimStart().startsWith('>')) {
          push({
            blockIndex: idx,
            field: 'content',
            severity: 'warning',
            message: `Inline choice '${row.text.trim().slice(0, 30)}' inside ${block.kind === 'encounter' ? 'an encounter' : 'a template'} — '>' only works in scenes, use '!' for encounter choices`,
            at: { target: 'prose', start: proseStart, end: proseStart + row.text.length },
          });
        }
      });
      if (proseLines.length) {
        check(idx, proseLines.join('\n'), 'content', (start, end) => ({ target: 'prose', start, end }));
      }
      return;
    }

    if (block.kind === 'scene') {
      block.rows.forEach((row, rowIndex) => {
        row.columns.forEach((col, colIndex) => {
          if (col.paramsRaw) {
            checkParams(idx, col.paramsRaw, 'content', (start, end) => ({ target: 'column-params', rowIndex, colIndex, start, end }));
          }
          if (col.content) {
            const locate: Locator = (start, end) => ({ target: 'column-content', rowIndex, colIndex, start, end });
            check(idx, col.content, 'content', locate);
            checkInlineChoices(idx, col.content, locate);
          }
        });
      });
      return;
    }
  });

  const starts = blockStartLines(doc);
  for (const issue of issues) {
    const block = doc.blocks[issue.blockIndex];
    const start = starts[issue.blockIndex] ?? 1;
    issue.line = block && issue.at ? start + anchorLineInBlock(block, issue.at) : start;
  }
  // Push order follows the check phases, not the text; the banner reads top-down.
  issues.sort((a, b) => a.line - b.line);

  return issues;
}
