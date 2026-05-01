import type { Document } from './ast';

export type LintIssue = {
  blockIndex: number;
  field?: 'paramsRaw' | 'content' | 'header';
  severity: 'error' | 'warning';
  message: string;
};

function countBraceBalance(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return depth;
}

/**
 * Replace `[code]…[/code]` blocks with same-length whitespace so braces and
 * other tokens inside them are ignored by the linter while preserving offsets
 * for range-based scanners that slice the original text.
 */
export function stripCodeBlocks(s: string): string {
  return s.replace(/\[code\][\s\S]*?\[\/code\]/gi, (match) => ' '.repeat(match.length));
}

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

function countCodeTagBalance(s: string): number {
  const opens = (s.match(/\[code\]/gi) || []).length;
  const closes = (s.match(/\[\/code\]/gi) || []).length;
  return opens - closes;
}

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
 * Returns `null` when valid, otherwise a short human-readable error message.
 */
export function validateParamsJson(raw: string): string | null {
  const s = raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (!s.trim().startsWith('{')) return `expected '{' at start`;

  let i = 0;
  const skipWs = () => { while (i < s.length && /\s/.test(s[i])) i++; };

  const readString = (): string | null => {
    const quote = s[i]; i++;
    while (i < s.length && s[i] !== quote) {
      if (s[i] === '\\') i++;
      i++;
    }
    if (i >= s.length) return `unclosed string`;
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

  const parseObject = (): string | null => {
    if (s[i] !== '{') return `expected '{' near '${context(i)}'`;
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
        return `expected key near '${context(i)}'`;
      }
      skipWs();
      // Colon
      if (s[i] !== ':') return `expected ':' near '${context(i)}'`;
      i++;
      skipWs();
      // Value
      const vErr = parseValue(); if (vErr) return vErr;
      skipWs();
      if (s[i] === ',') { i++; skipWs(); if (s[i] === '}') { i++; return null; } continue; }
      if (s[i] === '}') { i++; return null; }
      return `expected ',' or '}' near '${context(i)}'`;
    }
    return `unclosed '{'`;
  };

  const parseArray = (): string | null => {
    if (s[i] !== '[') return `expected '[' near '${context(i)}'`;
    i++;
    skipWs();
    if (s[i] === ']') { i++; return null; }
    while (i < s.length) {
      skipWs();
      const vErr = parseValue(); if (vErr) return vErr;
      skipWs();
      if (s[i] === ',') { i++; skipWs(); if (s[i] === ']') { i++; return null; } continue; }
      if (s[i] === ']') { i++; return null; }
      return `expected ',' or ']' near '${context(i)}'`;
    }
    return `unclosed '['`;
  };

  const parseValue = (): string | null => {
    const c = s[i];
    if (c === undefined) return `missing value`;
    if (c === '"' || c === "'") return readString();
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '-' || /[0-9]/.test(c)) { readNumber(); return null; }
    const rest = s.slice(i);
    const kw = rest.match(/^(true|false|null)\b/);
    if (kw) { i += kw[0].length; return null; }
    return `unquoted value near '${context(i)}' — wrap strings in quotes`;
  };

  skipWs();
  const err = parseObject();
  if (err) return err;
  skipWs();
  if (i < s.length) return `unexpected content after '}'`;
  return null;
}

export function lintDungeonContent(_source: string, doc: Document): LintIssue[] {
  const issues: LintIssue[] = [];

  const pushBraceIssue = (idx: number, field: LintIssue['field'], delta: number) => {
    if (delta === 0) return;
    issues.push({
      blockIndex: idx,
      field,
      severity: 'error',
      message:
        delta > 0
          ? `Unclosed '{' (${delta} unmatched)`
          : `Unmatched '}' (${-delta})`,
    });
  };

  const pushCodeIssue = (idx: number, field: LintIssue['field'], delta: number) => {
    if (delta === 0) return;
    issues.push({
      blockIndex: idx,
      field,
      severity: 'error',
      message:
        delta > 0
          ? `Unclosed [code] block (${delta})`
          : `Unmatched [/code] (${-delta})`,
    });
  };

  const validateBraceSubstrings = (idx: number, text: string, field: LintIssue['field']) => {
    for (const [start, end] of findBraceRanges(text)) {
      const segment = text.slice(start, end);
      const preview = segment.length > 30 ? segment.slice(0, 27) + '…' : segment;
      // Blank line inside a `{…}` breaks the game parser: in encounters/templates
      // it inserts `<br>` into the concatenated body, in scenes it starts a new
      // paragraph. Either way the JSON is split.
      if (/\n[ \t]*\n/.test(segment)) {
        issues.push({
          blockIndex: idx,
          field,
          severity: 'error',
          message: `Empty line inside '${preview}' — game engine treats blank lines as paragraph breaks`,
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
      const err = validateParamsJson(segment);
      if (err) {
        issues.push({
          blockIndex: idx,
          field,
          severity: 'error',
          message: `Invalid '${preview}': ${err}`,
        });
      }
    }
  };

  const check = (idx: number, text: string, field: LintIssue['field']) => {
    if (!text) return;
    pushCodeIssue(idx, field, countCodeTagBalance(text));
    // Brace scans ignore anything inside `[code]…[/code]` — those blocks are
    // literal raw passthrough and may contain `{` / `}` that aren't real params.
    const sanitized = stripCodeBlocks(text);
    pushBraceIssue(idx, field, countBraceBalance(sanitized));
    validateBraceSubstrings(idx, sanitized, field);
  };

  const checkParams = (idx: number, text: string, field: LintIssue['field']) => {
    if (!text) return;
    // paramsRaw is always the whole object (extracted by parser); validate it in one shot.
    pushCodeIssue(idx, field, countCodeTagBalance(text));
    const err = validateParamsJson(text);
    if (err) {
      issues.push({ blockIndex: idx, field, severity: 'error', message: `Invalid params: ${err}` });
    }
  };

  doc.blocks.forEach((block, idx) => {
    if (block.kind === 'raw') {
      check(idx, block.text, 'content');
      return;
    }

    if ('paramsRaw' in block && block.paramsRaw) {
      checkParams(idx, block.paramsRaw, 'paramsRaw');
    }

    if (block.kind === 'encounter' || block.kind === 'template') {
      // Join every text-like row into a single string before scanning, so
      // multi-line `{…}` blocks (one line per row after parsing) are treated
      // as one balanced expression by the brace + params-substring checks.
      const proseLines: string[] = [];
      for (const row of block.rows) {
        if (row.kind === 'text') proseLines.push(row.text);
        else if (row.kind === 'empty') proseLines.push('');
        else if (row.kind === 'comment') proseLines.push(row.text);
        else if (row.kind === 'code') check(idx, row.text, 'content');
        else if (row.kind === 'choice' && row.paramsRaw) checkParams(idx, row.paramsRaw, 'content');
      }
      if (proseLines.length) check(idx, proseLines.join('\n'), 'content');
      return;
    }

    if (block.kind === 'scene') {
      for (const row of block.rows) {
        for (const col of row.columns) {
          if (col.paramsRaw) checkParams(idx, col.paramsRaw, 'content');
          if (col.content) check(idx, col.content, 'content');
        }
      }
      return;
    }
  });

  return issues;
}
