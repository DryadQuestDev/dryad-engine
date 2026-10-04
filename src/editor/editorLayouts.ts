import type { Editor } from './editor';
import { Global } from '../global/global';
import type { Schemable } from '../utility/schema';

/** Mod-relative file of the editor layouts (`dev/editor_layouts.json`). See DevEditorLayoutSchema. */
export const EDITOR_LAYOUTS_FILE = 'dev/editor_layouts';

export type EditorLayoutWidget = 'auto' | 'stepper' | 'slider' | 'buttons' | 'toggle';

export interface EditorLayoutGroup {
  id: string;
  name?: string;
  order?: number;
  color?: string;
  collapsed?: boolean;
  members?: string[];
}

export interface EditorLayoutHint {
  id: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  widget?: EditorLayoutWidget;
  default_value?: string;
  pinned?: boolean;
  hidden?: boolean;
}

export interface EditorLayoutEntry {
  uid?: string;
  id: string;
  scope: string;
  name?: string;
  order?: number;
  groups?: EditorLayoutGroup[];
  hints?: EditorLayoutHint[];
  columns?: string[];
}

export interface ResolvedLayoutGroup {
  id: string;
  name: string;
  order: number;
  color: string | null;
  collapsed: boolean;
  members: string[];
}

export interface ResolvedLayout {
  groups: ResolvedLayoutGroup[];
  hints: Map<string, EditorLayoutHint>;
  /** Field key -> id of the first group listing it. */
  groupOf: Map<string, string>;
}

export interface ColumnSet {
  id: string;
  name: string;
  columns: string[];
  /** True when the set lives in the writable folder's file, so the editor may delete it. */
  writable: boolean;
}

/**
 * Every layout entry of the selected game and mod, merged plugin data -> _core -> mod by the
 * editor's loader. That loader concatenates the arrays of same-id entries, which is why
 * resolveLayout merges groups and hints by their own ids afterwards.
 */
export async function loadEditorLayouts(editor: Editor): Promise<EditorLayoutEntry[]> {
  try {
    const rows = await editor.loadFullData(EDITOR_LAYOUTS_FILE);
    return (rows as EditorLayoutEntry[]).filter(row => row && typeof row === 'object' && row.id && row.scope);
  } catch {
    return [];
  }
}

const GROUP_SCALARS = ['name', 'order', 'color', 'collapsed'] as const;

export function emptyLayout(): ResolvedLayout {
  return { groups: [], hints: new Map(), groupOf: new Map() };
}

/** Combine every entry of one scope into ordered groups and per-field hints. */
export function resolveLayout(entries: EditorLayoutEntry[], scope: string): ResolvedLayout {
  const inScope = entries
    .filter(entry => entry.scope === scope)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.order ?? 0) - (b.entry.order ?? 0) || a.index - b.index)
    .map(({ entry }) => entry);

  const groups = new Map<string, EditorLayoutGroup & { members: string[] }>();
  const hints = new Map<string, EditorLayoutHint>();

  for (const entry of inScope) {
    for (const group of entry.groups ?? []) {
      if (!group?.id) continue;
      const existing = groups.get(group.id);
      if (!existing) {
        groups.set(group.id, { ...group, members: [...(group.members ?? [])] });
        continue;
      }
      for (const key of GROUP_SCALARS) {
        if (group[key] !== undefined && group[key] !== null) (existing as any)[key] = group[key];
      }
      for (const member of group.members ?? []) {
        if (!existing.members.includes(member)) existing.members.push(member);
      }
    }
    for (const hint of entry.hints ?? []) {
      if (!hint?.id) continue;
      const existing = hints.get(hint.id) ?? { id: hint.id };
      for (const key in hint) {
        const value = (hint as any)[key];
        if (value !== undefined && value !== null && value !== '') (existing as any)[key] = value;
      }
      hints.set(hint.id, existing);
    }
  }

  const ordered = [...groups.values()]
    .map((group, index) => ({ group, index }))
    .sort((a, b) => (a.group.order ?? 0) - (b.group.order ?? 0) || a.index - b.index)
    .map(({ group }) => group);

  const groupOf = new Map<string, string>();
  const resolved: ResolvedLayoutGroup[] = [];
  for (const group of ordered) {
    const members = group.members.filter(member => !groupOf.has(member));
    for (const member of members) groupOf.set(member, group.id);
    resolved.push({
      id: group.id,
      name: group.name || group.id,
      order: group.order ?? 0,
      color: normalizeColor(group.color),
      collapsed: !!group.collapsed,
      members,
    });
  }

  return { groups: resolved, hints, groupOf };
}

/** The form's color field stores hex without '#'. */
export function normalizeColor(color: string | undefined | null): string | null {
  if (!color) return null;
  return color.startsWith('#') || color.startsWith('rgb') || color.startsWith('var(') ? color : `#${color}`;
}

/** Value a hint's `default_value` stands for, typed by the field it applies to. */
export function hintDefault(hint: EditorLayoutHint | undefined, field: Schemable | undefined): { found: boolean; value: any } {
  const raw = hint?.default_value;
  if (raw === undefined || raw === null || raw === '') return { found: false, value: undefined };
  switch (field?.type) {
    case 'number': {
      const num = Number(raw);
      return Number.isFinite(num) ? { found: true, value: num } : { found: false, value: undefined };
    }
    case 'boolean':
      return { found: true, value: String(raw).trim().toLowerCase() === 'true' };
    case 'chooseMany':
    case 'string[]':
      return { found: true, value: String(raw).split(',').map(part => part.trim()).filter(Boolean) };
    default:
      return { found: true, value: String(raw) };
  }
}

// ── Column sets (sheet scopes) ──

function layoutsPath(editor: Editor, mod: string): string {
  return `games_files/${editor.selectedGame}/${mod}/${EDITOR_LAYOUTS_FILE}.json`;
}

function writableMod(editor: Editor): string {
  return editor.selectedMod || '_core';
}

async function readLayoutsFile(editor: Editor, mod: string): Promise<EditorLayoutEntry[]> {
  try {
    const data = await Global.getInstance().readJson(layoutsPath(editor, mod));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function loadColumnSets(editor: Editor, entries: EditorLayoutEntry[], scope: string): Promise<ColumnSet[]> {
  const own = new Set((await readLayoutsFile(editor, writableMod(editor))).map(entry => entry.id));
  return entries
    .filter(entry => entry.scope === scope && Array.isArray(entry.columns) && entry.columns.length > 0)
    .map(entry => ({
      id: entry.id,
      name: entry.name || entry.id,
      // Same-id entries arrive with their arrays concatenated; a column set is a list, not a union.
      columns: [...new Set(entry.columns as string[])],
      writable: own.has(entry.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function columnSetId(scope: string, name: string): string {
  const slug = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'set';
  return `${slug(scope)}__${slug(name)}`;
}

/** Upserts a column set into the writable folder's layouts file (by scope and name). */
export async function saveColumnSet(editor: Editor, scope: string, name: string, columns: string[]): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || !editor.selectedGame) return;
  const mod = writableMod(editor);
  const id = columnSetId(scope, trimmed);
  const entries = await readLayoutsFile(editor, mod);
  const existing = entries.find(entry => entry.id === id);
  const entry: EditorLayoutEntry = {
    uid: existing?.uid ?? editor.createUid(),
    id,
    scope,
    name: trimmed,
    columns: [...columns],
  };
  const next = existing ? entries.map(item => (item.id === id ? { ...item, ...entry } : item)) : [...entries, entry];
  await Global.getInstance().writeJson(layoutsPath(editor, mod), next);
}

export async function removeColumnSet(editor: Editor, id: string): Promise<void> {
  if (!editor.selectedGame) return;
  const mod = writableMod(editor);
  const entries = await readLayoutsFile(editor, mod);
  await Global.getInstance().writeJson(layoutsPath(editor, mod), entries.filter(entry => entry.id !== id));
}
