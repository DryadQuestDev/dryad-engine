import type { Block, Document, Row, SceneBlock, SceneColumn } from './ast';

export function serializeAst(doc: Document): string {
  return doc.blocks.filter(Boolean).map(serializeBlock).join('\n');
}

function serializeBlock(block: Block): string {
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

function serializeRow(row: Row): string {
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

function serializeSceneColumn(column: SceneColumn): string {
  const prefix = column.kind === '%' ? '%' : '~' + (column.name ?? '') + (column.paramsRaw ?? '');
  if (column.content === '') return prefix;
  return prefix + '\n' + column.content;
}
