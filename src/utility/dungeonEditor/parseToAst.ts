import type {
  Document,
  EncounterBlock,
  SceneBlock,
  SceneColumn,
  SceneRow,
  TemplateBlock,
} from './ast';

type OpenBlock = EncounterBlock | SceneBlock | TemplateBlock;

export function parseToAst(text: string): Document {
  const doc: Document = { blocks: [] };
  if (!text) return doc;

  const normalized = text.replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  let current: OpenBlock | null = null;

  const pushRaw = (line: string) => {
    const last = doc.blocks[doc.blocks.length - 1];
    if (last && last.kind === 'raw') {
      last.text += '\n' + line;
    } else {
      doc.blocks.push({ kind: 'raw', text: line });
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // [code]...[/code] — may span lines. Capture as a single chunk.
    if (line.includes('[code]')) {
      const buf: string[] = [line];
      while (!buf[buf.length - 1].includes('[/code]') && i + 1 < lines.length) {
        i++;
        buf.push(lines[i]);
      }
      const codeText = buf.join('\n');
      if (current) {
        appendToBlock(current, codeText, /*isEmpty*/ false, /*isCode*/ true);
      } else {
        pushRaw(codeText);
      }
      i++;
      continue;
    }

    // Block headers close any open block.
    if (line.length > 0 && ['^', '@', '#', '$'].includes(line[0])) {
      const sigil = line[0];
      const rest = line.substring(1);
      const { body, paramsRaw } = splitTrailingParams(rest);
      const id = body.trim();

      if (sigil === '^') {
        doc.blocks.push({ kind: 'room', id, paramsRaw });
        current = null;
      } else if (sigil === '@') {
        const block: EncounterBlock = { kind: 'encounter', id, paramsRaw, rows: [] };
        doc.blocks.push(block);
        current = block;
      } else if (sigil === '#') {
        const block: SceneBlock = { kind: 'scene', id, paramsRaw, rows: [] };
        doc.blocks.push(block);
        current = block;
      } else if (sigil === '$') {
        const block: TemplateBlock = { kind: 'template', id, paramsRaw, rows: [] };
        doc.blocks.push(block);
        current = block;
      }
      i++;
      continue;
    }

    if (current) {
      appendToBlock(current, line, line.trim() === '', false);
    } else {
      pushRaw(line);
    }
    i++;
  }

  return doc;
}

function appendToBlock(block: OpenBlock, line: string, isEmpty: boolean, isCode: boolean) {
  if (block.kind === 'scene') {
    appendSceneLine(block, line, isCode);
    return;
  }
  appendGenericLine(block, line, isEmpty, isCode);
}

// Encounter / Template — flat rows.
function appendGenericLine(block: EncounterBlock | TemplateBlock, line: string, isEmpty: boolean, isCode: boolean) {
  if (isCode) {
    block.rows.push({ kind: 'code', text: line });
    return;
  }
  if (isEmpty) {
    block.rows.push({ kind: 'empty' });
    return;
  }
  if (line.startsWith('//')) {
    block.rows.push({ kind: 'comment', text: line });
    return;
  }
  if (line.startsWith('!')) {
    const { body, paramsRaw } = splitTrailingParams(line.substring(1));
    const valMatch = body.match(/^(.*)<([^<>]*)>\s*$/);
    if (valMatch) {
      block.rows.push({ kind: 'choice', name: valMatch[1].trim(), value: valMatch[2], paramsRaw });
    } else {
      block.rows.push({ kind: 'choice', name: body.trim(), paramsRaw });
    }
    return;
  }
  block.rows.push({ kind: 'text', text: line });
}

// Scene — grid of rows × columns × content.
function appendSceneLine(scene: SceneBlock, line: string, isCode: boolean) {
  const trimmed = line.trim();

  if (!isCode && /^\d+$/.test(trimmed)) {
    scene.rows.push({ columns: [] });
    return;
  }
  if (!isCode && trimmed === '%') {
    ensureRow(scene).columns.push({ kind: '%', content: '' });
    return;
  }
  if (!isCode && line.startsWith('~')) {
    const { body, paramsRaw } = splitTrailingParams(line.substring(1));
    ensureRow(scene).columns.push({
      kind: '~',
      name: body.trim(),
      paramsRaw,
      content: '',
    });
    return;
  }
  // Blank line: tolerate decorative whitespace between structural markers —
  // only extend existing content with a newline if there's something to extend.
  if (!isCode && trimmed === '') {
    const lastRow = scene.rows[scene.rows.length - 1];
    if (!lastRow) return;
    const lastCol = lastRow.columns[lastRow.columns.length - 1];
    if (!lastCol || lastCol.content === '') return;
    lastCol.content += '\n';
    return;
  }
  // Content line — auto-recover a `%` column if malformed content has no
  // prior `%`/`~` (invalid DryadScript but we don't want to lose it).
  const row = ensureRow(scene);
  const column = ensureColumn(row);
  column.content = column.content === '' ? line : column.content + '\n' + line;
}

function ensureRow(scene: SceneBlock): SceneRow {
  if (scene.rows.length === 0) scene.rows.push({ columns: [] });
  return scene.rows[scene.rows.length - 1];
}

function ensureColumn(row: SceneRow): SceneColumn {
  if (row.columns.length === 0) row.columns.push({ kind: '%', content: '' });
  return row.columns[row.columns.length - 1];
}

/**
 * Finds a balanced `{...}` substring in the line (nested braces supported)
 * and returns the remainder as body. If multiple `{...}` groups exist, takes
 * the first one. Unbalanced braces leave the string untouched.
 */
export function splitTrailingParams(rest: string): { body: string; paramsRaw?: string } {
  const firstBrace = rest.indexOf('{');
  if (firstBrace === -1) return { body: rest };

  let depth = 0;
  let endBrace = -1;
  for (let i = firstBrace; i < rest.length; i++) {
    const c = rest[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        endBrace = i;
        break;
      }
    }
  }
  if (endBrace === -1) return { body: rest };

  const paramsRaw = rest.substring(firstBrace, endBrace + 1);
  const body = (rest.substring(0, firstBrace) + rest.substring(endBrace + 1)).trimEnd();
  return { body, paramsRaw };
}
