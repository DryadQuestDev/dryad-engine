import type { ResolvedLayout } from '../../../editorLayouts';
import { plainText } from './fieldHelpers';

/**
 * An aspect whose in-game description names a sibling (`[status_stacks_target]`) owns that
 * sibling: the card prints the sibling only inside the owner's line. The editor reads the same
 * links to render companions inline with their owner. Built per role, since meta templates only
 * reference meta and aspect templates only aspects.
 */
export interface CompanionIndex {
  /** Owner id -> the companion ids its template references, in template order. */
  companionsOf: Map<string, string[]>;
  /** Companion id -> the owners that reference it. */
  ownersOf: Map<string, string[]>;
}

/** An empty index, for definition sets whose templates never reference each other. */
export function emptyCompanionIndex(): CompanionIndex {
  return { companionsOf: new Map(), ownersOf: new Map() };
}

export interface PaletteItem {
  value: string;
  label: string;
  desc: string;
}

export interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

/**
 * Fields a dev can add, grouped for a grouped select: the most used ones first (counted over the
 * game's own data when the popup opens, never stored), then the layout's groups; without a
 * layout, the definitions' first tag; the rest last.
 */
export function buildPalette(keys: string[], layout: ResolvedLayout, defsById: Map<string, any>, usage: Map<string, number>, topN = 8): PaletteGroup[] {
  const visible = keys.filter(key => !layout.hints.get(key)?.hidden);
  const visibleSet = new Set(visible);
  const item = (key: string): PaletteItem => ({ value: key, label: key, desc: plainText(defsById.get(key)?.description).slice(0, 160) });
  const byDefOrder = (a: string, b: string) => (defsById.get(a)?.order ?? 0) - (defsById.get(b)?.order ?? 0) || a.localeCompare(b);

  const groups: PaletteGroup[] = [];
  const frequent = visible
    .filter(key => (usage.get(key) ?? 0) > 0)
    .sort((a, b) => (usage.get(b) ?? 0) - (usage.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, topN);
  if (frequent.length >= 3 && visible.length > topN) groups.push({ label: 'Most used', items: frequent.map(item) });

  const placed = new Set<string>();
  if (layout.groups.length) {
    for (const group of layout.groups) {
      const members = group.members.filter(member => visibleSet.has(member));
      for (const member of members) placed.add(member);
      if (members.length) groups.push({ label: group.name, items: members.map(item) });
    }
  } else {
    const byTag = new Map<string, string[]>();
    for (const key of visible) {
      const tag = defsById.get(key)?.tags?.[0];
      if (!tag) continue;
      placed.add(key);
      const list = byTag.get(tag) ?? [];
      list.push(key);
      byTag.set(tag, list);
    }
    for (const [tag, list] of [...byTag].sort((a, b) => a[0].localeCompare(b[0]))) {
      groups.push({ label: tag, items: list.sort(byDefOrder).map(item) });
    }
  }
  const rest = visible.filter(key => !placed.has(key)).sort(byDefOrder);
  if (rest.length) groups.push({ label: groups.length ? 'Other' : 'All', items: rest.map(item) });
  return groups;
}

/** Short name of a companion next to its owner: status_stacks_target beside status_apply_target reads "stacks". */
export function companionLabel(companion: string, owner: string): string {
  const c = companion.split('_');
  const o = owner.split('_');
  let start = 0;
  while (start < c.length && start < o.length && c[start] === o[start]) start++;
  let end = 0;
  while (end < c.length - start && end < o.length - start && c[c.length - 1 - end] === o[o.length - 1 - end]) end++;
  const core = c.slice(start, c.length - end);
  return (core.length ? core : c).join(' ');
}
