import type { Block, Document, EncounterBlock, SceneBlock, SceneColumn, TemplateBlock } from './ast';
import type { IssueAnchor } from './lint';
import { serializeBlock, serializeRow, serializeSceneColumn } from './serializeAst';

/**
 * Line arithmetic over the serialized dungeon text — the same string the
 * Raw view shows and `content_raw.txt` stores. Every count here is derived
 * from the serializer's own output so the two can never disagree.
 */

function lineCount(s: string): number {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

function linesBefore(s: string, offset: number): number {
  const end = Math.min(offset, s.length);
  let n = 0;
  for (let i = 0; i < end; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

/** 1-based line of every block's header line in `serializeAst(doc)`. */
export function blockStartLines(doc: Document): number[] {
  const out: number[] = [];
  let line = 1;
  for (const block of doc.blocks) {
    out.push(line);
    // serializeAst drops falsy entries without emitting a separator.
    if (!block) continue;
    line += lineCount(serializeBlock(block)) + 1;
  }
  return out;
}

type ProseRow = Extract<EncounterBlock['rows'][number], { kind: 'text' | 'empty' | 'comment' }>;

/** Text-like rows are what the editor merges into one prose textarea. */
function isProseRow(row: EncounterBlock['rows'][number]): row is ProseRow {
  return row.kind === 'text' || row.kind === 'empty' || row.kind === 'comment';
}

/** Offset (0-based, from the header line) of row `rowIndex` inside the block. */
function rowLine(block: EncounterBlock | TemplateBlock, rowIndex: number): number {
  let line = 1;
  for (let k = 0; k < rowIndex && k < block.rows.length; k++) {
    line += lineCount(serializeRow(block.rows[k]));
  }
  return line;
}

function genericAnchorLine(block: EncounterBlock | TemplateBlock, at: IssueAnchor): number {
  const start = at.start ?? 0;
  if (at.target === 'prose') {
    let offset = 0;
    for (let r = 0; r < block.rows.length; r++) {
      const row = block.rows[r];
      if (!isProseRow(row)) continue;
      const text = row.kind === 'empty' ? '' : row.text;
      if (start <= offset + text.length) return rowLine(block, r);
      offset += text.length + 1;
    }
    return rowLine(block, block.rows.length);
  }
  if (at.rowIndex === undefined) return 0;
  const base = rowLine(block, at.rowIndex);
  const row = block.rows[at.rowIndex];
  if (at.target === 'row-text' && row && 'text' in row) return base + linesBefore(row.text, start);
  return base;
}

function columnLineCount(col: SceneColumn): number {
  return lineCount(serializeSceneColumn(col));
}

function sceneAnchorLine(block: SceneBlock, at: IssueAnchor): number {
  if (at.rowIndex === undefined) return 0;
  let line = 1;
  for (let r = 0; r < at.rowIndex && r < block.rows.length; r++) {
    line += 1;
    for (const col of block.rows[r].columns) line += columnLineCount(col);
  }
  const row = block.rows[at.rowIndex];
  if (!row) return line;
  // The row-number line itself, then the columns before ours.
  line += 1;
  const colIndex = at.colIndex ?? 0;
  for (let c = 0; c < colIndex && c < row.columns.length; c++) line += columnLineCount(row.columns[c]);
  const col = row.columns[colIndex];
  if (at.target === 'column-content' && col) {
    line += 1 + linesBefore(col.content, at.start ?? 0);
  }
  return line;
}

/**
 * 0-based line offset of `at` from the block's header line. Add it to the
 * block's entry in `blockStartLines` for the absolute line.
 */
export function anchorLineInBlock(block: Block, at: IssueAnchor): number {
  switch (block.kind) {
    case 'raw':
      return linesBefore(block.text, at.start ?? 0);
    case 'room':
      return 0;
    case 'scene':
      return sceneAnchorLine(block, at);
    case 'encounter':
    case 'template':
      return genericAnchorLine(block, at);
  }
}

/** Character offset of the start of 1-based `line` in `text`. */
export function lineStartOffset(text: string, line: number): number {
  let pos = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf('\n', pos);
    if (nl === -1) return text.length;
    pos = nl + 1;
  }
  return pos;
}
