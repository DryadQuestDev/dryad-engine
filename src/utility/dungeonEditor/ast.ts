export type Document = {
  blocks: Block[];
};

export type Block = RoomBlock | EncounterBlock | SceneBlock | TemplateBlock | RawBlock;

export type RoomBlock = {
  kind: 'room';
  id: string;
  paramsRaw?: string;
};

export type EncounterBlock = {
  kind: 'encounter';
  id: string;
  paramsRaw?: string;
  rows: Row[];
};

export type SceneBlock = {
  kind: 'scene';
  id: string;
  paramsRaw?: string;
  rows: SceneRow[];
};

export type TemplateBlock = {
  kind: 'template';
  id: string;
  paramsRaw?: string;
  rows: Row[];
};

export type RawBlock = {
  kind: 'raw';
  text: string;
};

/**
 * Scene-specific structure: a scene is a 2D grid of rows (auto-numbered 1..N)
 * each holding one or more columns. Each column is either a `%` (unnamed)
 * or `~name` (named transition) section with its own free-form text content.
 */
export type SceneRow = {
  columns: SceneColumn[];
};

export type SceneColumn = {
  kind: '%' | '~';
  name?: string;
  paramsRaw?: string;
  content: string;
};

/**
 * Generic row used by encounters and templates. Scene-specific kinds
 * (`choice_gt`, `row_marker`, `separator`, `anchor`, `transition`) are gone —
 * they're expressed natively in the scene grid now. Anchors / `>choice` in
 * imported content survive as raw text inside a column's `content` string.
 */
export type Row =
  | { kind: 'choice'; name: string; value?: string; paramsRaw?: string }
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
  | { kind: 'comment'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'raw'; text: string };

export type RowKind = Row['kind'];

export function newDocument(): Document {
  return { blocks: [] };
}

export function newEncounter(id: string = 'new_encounter'): EncounterBlock {
  const rows: EncounterBlock['rows'] = id === 'description'
    ? []
    : [{ kind: 'choice', name: 'choice1' }];
  return { kind: 'encounter', id, rows };
}

export function newScene(id: string = 'new_scene'): SceneBlock {
  return {
    kind: 'scene',
    id,
    rows: [{ columns: [{ kind: '%', content: '' }] }],
  };
}

export function newTemplate(id: string = 'new_template'): TemplateBlock {
  return { kind: 'template', id, rows: [] };
}

export function newRoom(id: string = 'new_room'): RoomBlock {
  return { kind: 'room', id };
}

export function newSceneRow(): SceneRow {
  return { columns: [{ kind: '%', content: '' }] };
}

export function newSceneColumn(kind: '%' | '~'): SceneColumn {
  if (kind === '~') return { kind: '~', name: '', content: '' };
  return { kind: '%', content: '' };
}
