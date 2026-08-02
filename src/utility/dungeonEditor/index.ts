import { jsonrepair } from 'jsonrepair';
import type { Block, Document } from './ast';
import { stripCodeBlocks, stripCommentLines } from './comments';
import { findBraceRanges } from './lint';

export type IndexCategory = 'action' | 'flag' | 'anchor' | 'loot' | 'trade';

export type IndexEntry = {
  name: string;
  blockIndices: Set<number>;
  count: number;
};

export type DocumentIndex = Record<IndexCategory, IndexEntry[]>;

const COND_KEYWORDS = ['ifOr', 'else', 'if', 'fi'] as const;

function isConditionKeyword(text: string, braceStart: number): boolean {
  for (const kw of COND_KEYWORDS) {
    const kwStart = braceStart - kw.length;
    if (kwStart < 0) continue;
    if (text.substring(kwStart, braceStart) !== kw) continue;
    const prev = kwStart > 0 ? text[kwStart - 1] : '';
    if (!/\w/.test(prev)) return true;
  }
  return false;
}

function tryParseBraceObject(raw: string): Record<string, unknown> | null {
  const normalized = raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  try {
    const repaired = jsonrepair(normalized);
    const parsed = JSON.parse(repaired);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore — malformed params don't contribute to the index
  }
  return null;
}

function collectFlagNames(value: unknown, out: Set<string>): void {
  if (typeof value !== 'string') return;
  for (const part of value.split(',')) {
    const m = part.trim().match(/^([\w.]+)\s*[=><]/);
    if (m) out.add(m[1]);
  }
}

class IndexBuilder {
  private buckets: Record<IndexCategory, Map<string, { indices: Set<number>; count: number }>> = {
    action: new Map(),
    flag: new Map(),
    anchor: new Map(),
    loot: new Map(),
    trade: new Map(),
  };

  bump(kind: IndexCategory, name: string, blockIndex: number) {
    const map = this.buckets[kind];
    let entry = map.get(name);
    if (!entry) {
      entry = { indices: new Set<number>(), count: 0 };
      map.set(name, entry);
    }
    entry.indices.add(blockIndex);
    entry.count += 1;
  }

  scanBraces(text: string, blockIndex: number): void {
    if (!text) return;
    // Commented-out actions are not actions — the engine never sees them.
    const sanitized = stripCodeBlocks(stripCommentLines(text));
    for (const [start, end] of findBraceRanges(sanitized)) {
      if (isConditionKeyword(sanitized, start)) continue;
      const segment = sanitized.slice(start, end);
      const parsed = tryParseBraceObject(segment);
      if (!parsed) continue;

      for (const [key, value] of Object.entries(parsed)) {
        this.bump('action', key, blockIndex);
        if (key === 'flag') {
          const flags = new Set<string>();
          collectFlagNames(value, flags);
          for (const flag of flags) this.bump('flag', flag, blockIndex);
        } else if (key === 'loot' && typeof value === 'string' && value) {
          this.bump('loot', value, blockIndex);
        } else if (key === 'trade' && typeof value === 'string' && value) {
          this.bump('trade', value, blockIndex);
        }
      }
    }
  }

  scanAnchors(text: string, blockIndex: number): void {
    if (!text) return;
    const sanitized = stripCodeBlocks(stripCommentLines(text));
    const re = /(^|\n)&(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sanitized)) !== null) {
      this.bump('anchor', m[2], blockIndex);
    }
  }

  build(): DocumentIndex {
    const finalize = (map: Map<string, { indices: Set<number>; count: number }>): IndexEntry[] => {
      const entries: IndexEntry[] = [];
      for (const [name, { indices, count }] of map) {
        entries.push({ name, blockIndices: indices, count });
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      return entries;
    };
    return {
      action: finalize(this.buckets.action),
      flag: finalize(this.buckets.flag),
      anchor: finalize(this.buckets.anchor),
      loot: finalize(this.buckets.loot),
      trade: finalize(this.buckets.trade),
    };
  }
}

function scanBlock(builder: IndexBuilder, block: Block, idx: number): void {
  if (block.kind === 'raw') {
    builder.scanBraces(block.text, idx);
    builder.scanAnchors(block.text, idx);
    return;
  }
  if ('paramsRaw' in block && block.paramsRaw) {
    builder.scanBraces(block.paramsRaw, idx);
  }
  if (block.kind === 'encounter' || block.kind === 'template') {
    const proseLines: string[] = [];
    for (const row of block.rows) {
      if (row.kind === 'text') proseLines.push(row.text);
      else if (row.kind === 'empty') proseLines.push('');
      else if (row.kind === 'comment') proseLines.push(row.text);
      else if (row.kind === 'code') {
        builder.scanBraces(row.text, idx);
      } else if (row.kind === 'choice' && row.paramsRaw) {
        builder.scanBraces(row.paramsRaw, idx);
      }
    }
    if (proseLines.length) {
      const joined = proseLines.join('\n');
      builder.scanBraces(joined, idx);
      builder.scanAnchors(joined, idx);
    }
    return;
  }
  if (block.kind === 'scene') {
    for (const row of block.rows) {
      for (const col of row.columns) {
        if (col.paramsRaw) builder.scanBraces(col.paramsRaw, idx);
        if (col.content) {
          builder.scanBraces(col.content, idx);
          builder.scanAnchors(col.content, idx);
        }
      }
    }
  }
}

export function buildDocumentIndex(doc: Document): DocumentIndex {
  const builder = new IndexBuilder();
  doc.blocks.forEach((block, idx) => {
    if (!block) return;
    scanBlock(builder, block, idx);
  });
  return builder.build();
}
