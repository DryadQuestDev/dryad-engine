import type { Block, Row } from './ast';
import type { IssueAnchor } from './lint';
import { readMeta, writeMeta } from './meta';

/**
 * `block` with `[start, end)` of an issue's target text replaced by `text`, in the target's own
 * coordinates (what IssueAnchor ranges and lint fixes use). Null when the target is not there.
 */
export function editTarget(block: Block, at: IssueAnchor, start: number, end: number, text: string): Block | null {
  const splice = (s: string | undefined): string | null =>
    s === undefined || start < 0 || end > s.length || start > end ? null : s.slice(0, start) + text + s.slice(end);

  switch (at.target) {
    case 'header-params': {
      if (!('paramsRaw' in block)) return null;
      const next = splice(block.paramsRaw);
      return next === null ? null : { ...block, paramsRaw: next };
    }
    case 'raw': {
      if (block.kind !== 'raw') return null;
      const next = splice(block.text);
      return next === null ? null : { ...block, text: next };
    }
    case 'row-params':
    case 'row-text': {
      if ((block.kind !== 'encounter' && block.kind !== 'template') || at.rowIndex === undefined) return null;
      const row = block.rows[at.rowIndex];
      let next: Row | null = null;
      if (at.target === 'row-params' && row?.kind === 'choice') {
        const p = splice(row.paramsRaw);
        if (p !== null) next = { ...row, paramsRaw: p };
      } else if (at.target === 'row-text' && row?.kind === 'code') {
        const t = splice(row.text);
        if (t !== null) next = { ...row, text: t };
      }
      if (!next) return null;
      const rows = [...block.rows];
      rows[at.rowIndex] = next;
      return { ...block, rows };
    }
    case 'prose': {
      // The merged prose textarea: text, empty and comment rows joined by newlines (lint.ts).
      if (block.kind !== 'encounter' && block.kind !== 'template') return null;
      let offset = 0;
      for (let i = 0; i < block.rows.length; i++) {
        const row = block.rows[i];
        if (row.kind !== 'text' && row.kind !== 'empty' && row.kind !== 'comment') continue;
        const line = row.kind === 'empty' ? '' : row.text;
        if (start >= offset && end <= offset + line.length && row.kind !== 'empty') {
          const rows = [...block.rows];
          rows[i] = { ...row, text: line.slice(0, start - offset) + text + line.slice(end - offset) };
          return { ...block, rows };
        }
        offset += line.length + 1;
      }
      return null;
    }
    case 'column-params':
    case 'column-content': {
      if (block.kind !== 'scene' || at.rowIndex === undefined || at.colIndex === undefined) return null;
      const sceneRow = block.rows[at.rowIndex];
      const col = sceneRow?.columns[at.colIndex];
      if (!col) return null;
      const next = splice(at.target === 'column-params' ? col.paramsRaw : col.content);
      if (next === null) return null;
      const columns = [...sceneRow.columns];
      columns[at.colIndex] = at.target === 'column-params' ? { ...col, paramsRaw: next } : { ...col, content: next };
      const rows = [...block.rows];
      rows[at.rowIndex] = { ...sceneRow, columns };
      return { ...block, rows };
    }
  }
  return null;
}

/** `block` without `key` in its `__meta.ignore` list: that check reports here again. */
export function withoutIgnore(block: Block, key: string): Block | null {
  if (!('paramsRaw' in block)) return null;
  const meta = readMeta(block.paramsRaw);
  const ignore = Array.isArray(meta?.ignore) ? meta!.ignore.map(String) : [];
  if (!ignore.includes(key)) return block;
  const rest = ignore.filter((k) => k !== key);
  const next: Record<string, unknown> = { ...meta };
  if (rest.length) next.ignore = rest; else delete next.ignore;
  return { ...block, paramsRaw: writeMeta(block.paramsRaw, next) };
}

/** `block` with `key` added to its `__meta.ignore` list, so that check stays quiet here. Null for a raw block. */
export function withIgnore(block: Block, key: string): Block | null {
  if (!('paramsRaw' in block)) return null;
  const meta = readMeta(block.paramsRaw) ?? {};
  const ignore = Array.isArray(meta.ignore) ? meta.ignore.map(String) : [];
  if (ignore.includes(key)) return block;
  return { ...block, paramsRaw: writeMeta(block.paramsRaw, { ...meta, ignore: [...ignore, key] }) };
}
