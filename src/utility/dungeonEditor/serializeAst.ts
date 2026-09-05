import type { Block, Document, Row, SceneBlock, SceneColumn } from './ast';

// Per-block memoization keyed by block reference. The popup mutates blocks
// via spread (`{ ...block, field: newValue }`), so a typed character makes
// ONE block get a fresh reference — cache miss on that block, hit on every
// other unchanged block. Without this, `serializeAst` was O(total content)
// per keystroke (re-serializing 252 blocks for a 1-character edit). Now it's
// O(1 block + array-join). WeakMap entries auto-free when blocks fall out
// of the doc.
const blockCache = new WeakMap<Block, string>();

function serializeBlockCached(block: Block): string {
  let cached = blockCache.get(block);
  if (cached === undefined) {
    cached = serializeBlock(block);
    blockCache.set(block, cached);
  }
  return cached;
}

export function serializeAst(doc: Document): string {
  // Blocks are separated by a blank line on disk so the file is readable and
  // round-trips cleanly: parser strips trailing blank lines from each block,
  // serializer puts a single blank line back between blocks.
  return doc.blocks.filter(Boolean).map(serializeBlockCached).join('\n\n');
}

export function serializeBlock(block: Block): string {
  if (block.kind === 'raw') return block.text;

  if (block.kind === 'room') {
    return '^' + block.id + (block.paramsRaw ?? '');
  }

  if (block.kind === 'scene') {
    return serializeScene(block);
  }

  const sigil = block.kind === 'encounter' ? '@' : '$';
  const header = sigil + block.id + (block.paramsRaw ?? '');
  if (block.rows.length === 0) return header;
  const body = block.rows.map(serializeRow).join('\n');
  return header + '\n' + body;
}

export function serializeRow(row: Row): string {
  switch (row.kind) {
    case 'choice': {
      let s = '!' + row.name;
      if (row.value !== undefined) s += '<' + row.value + '>';
      if (row.paramsRaw) s += row.paramsRaw;
      return s;
    }
    case 'text':
      return row.text;
    case 'empty':
      return '';
    case 'comment':
      return row.text;
    case 'code':
      return row.text;
    case 'raw':
      return row.text;
  }
}

function serializeScene(scene: SceneBlock): string {
  const out: string[] = ['#' + scene.id + (scene.paramsRaw ?? '')];
  scene.rows.forEach((row, rowIdx) => {
    out.push(String(rowIdx + 1));
    for (const column of row.columns) {
      out.push(serializeSceneColumn(column));
    }
  });
  return out.join('\n');
}

export function serializeSceneColumn(column: SceneColumn): string {
  const prefix = column.kind === '%' ? '%' : '~' + (column.name ?? '') + (column.paramsRaw ?? '');
  if (column.content === '') return prefix;
  return prefix + '\n' + column.content;
}
