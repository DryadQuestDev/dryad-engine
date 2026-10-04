import type { Schema, Schemable } from '../../../../utility/schema';
import { fileOfSubtab, mainTabOf } from '../../../editorJump';
import type { ResolvedLayout } from '../../../editorLayouts';
import {
  clone, displayValue, entityName, idLabel, isEmptyValue, isNumberMap, isSimpleField, plainText,
} from '../../shared/fields/fieldHelpers';

export { clone, displayValue, entityName, idLabel, isEmptyValue, isNumberMap, isSimpleField, plainText };
export { fileOfSubtab, mainTabOf };
export { buildPalette, companionLabel } from '../../shared/fields/fieldGroups';
export type { CompanionIndex, PaletteGroup, PaletteItem } from '../../shared/fields/fieldGroups';
import type { CompanionIndex, PaletteGroup } from '../../shared/fields/fieldGroups';

// ── Description templates ──

export type TemplatePart =
  | { kind: 'text'; text: string }
  | { kind: 'self'; mode?: string }
  | { kind: 'sibling'; id: string; mode?: string };

// Same token rule as the card's description builder: `[v]`, `[v:mode]`, `[sibling]`,
// `[sibling:mode]`, never the inside of a `[[lore link]]`.
const TOKEN = /(?<!\[)\[([a-zA-Z0-9_]+)(?::(id|status|character))?\](?!\])/g;

export function parseTemplate(html: string | undefined | null): TemplatePart[] {
  const text = plainText(html);
  if (!text) return [];
  const parts: TemplatePart[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: 'text', text: text.slice(last, index) });
    if (match[1] === 'v') parts.push({ kind: 'self', mode: match[2] });
    else parts.push({ kind: 'sibling', id: match[1], mode: match[2] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

// ── Companions ──

export function definitionRole(def: any): 'meta' | 'aspect' {
  return def?.role === 'meta' ? 'meta' : 'aspect';
}

export function buildCompanionIndex(definitions: any[], role: 'meta' | 'aspect'): CompanionIndex {
  const ofRole = definitions.filter(def => def?.id && definitionRole(def) === role);
  const ids = new Set(ofRole.map(def => def.id as string));
  const companionsOf = new Map<string, string[]>();
  const ownersOf = new Map<string, string[]>();
  for (const def of ofRole) {
    const siblings: string[] = [];
    for (const part of parseTemplate(def.ingame_description)) {
      if (part.kind !== 'sibling' || part.id === def.id || !ids.has(part.id)) continue;
      if (!siblings.includes(part.id)) siblings.push(part.id);
    }
    if (!siblings.length) continue;
    companionsOf.set(def.id, siblings);
    for (const sibling of siblings) {
      const owners = ownersOf.get(sibling) ?? [];
      owners.push(def.id);
      ownersOf.set(sibling, owners);
    }
  }
  return { companionsOf, ownersOf };
}

// ── Effects ──

export function effectKey(effect: any): string {
  return effect?.id ?? 'undefined';
}

/** The card and combat order: `order` ascending, then id. */
export function sortedEffectIndexes(effects: any[]): number[] {
  return effects
    .map((effect, index) => ({ effect, index }))
    .sort((a, b) => (a.effect?.order ?? 0) - (b.effect?.order ?? 0) || effectKey(a.effect).localeCompare(effectKey(b.effect)))
    .map(({ index }) => index);
}

export function nextEffectId(effects: any[], taken: Iterable<string> = []): string {
  const used = new Set<string>([...effects.map(effectKey), ...taken]);
  for (let n = 1; ; n++) {
    if (!used.has(`e${n}`)) return `e${n}`;
  }
}

export function aspectSummary(template: any): string {
  const keys = new Set<string>();
  for (const effect of template?.effects ?? []) for (const key in effect?.aspects ?? {}) keys.add(key);
  return [...keys].join(', ');
}

// ── Where an ability is used ──

export interface UsageRef {
  subTab: string;
  kind: string;
  id: string;
  label: string;
  asModifier: boolean;
}

export interface UsageSources {
  characterTemplates: any[];
  statuses: any[];
  itemTemplates: any[];
  skillSlots: any[];
}

export function findUsage(abilityId: string | undefined, sources: UsageSources | null): UsageRef[] {
  if (!abilityId || !sources) return [];
  const out: UsageRef[] = [];
  const scan = (holder: any, subTab: string, kind: string, row: any) => {
    if (!holder) return;
    const label = idLabel(row.id, entityName(row));
    if ((holder.abilities ?? []).includes(abilityId)) out.push({ subTab, kind, id: row.id, label, asModifier: false });
    if ((holder.ability_modifiers ?? []).includes(abilityId)) out.push({ subTab, kind, id: row.id, label, asModifier: true });
  };
  for (const row of sources.characterTemplates) scan(row, 'character_templates', 'character', row);
  for (const row of sources.statuses) scan(row, 'character_statuses', 'status', row);
  for (const row of sources.itemTemplates) scan(row.status, 'item_templates', 'item', row);
  for (const row of sources.skillSlots) scan(row.status, 'skill_slots', 'skill slot', row);
  return out;
}

// ── Warnings ──

export interface LintItem {
  level: 'warn' | 'info';
  text: string;
  /** Effect the warning is about, as its list index. */
  effectIndex?: number;
}

export interface LintContext {
  item: any;
  metaFields: Schema;
  aspectFields: Schema;
  defsById: Map<string, any>;
  aspectCompanions: CompanionIndex;
  /** The template a modifier modifies, when it resolves. */
  base: any | null;
  /** The ability groups tab has entries, so group-less abilities drop out of grouped UIs. */
  groupsExist: boolean;
}

function danglingValues(field: Schemable | undefined, value: any): string[] {
  const options = field?.options;
  if (!Array.isArray(options) || options.length === 0) return [];
  const known = new Set(options.map(option => (option && typeof option === 'object' ? option.value ?? option.id : option)));
  const values = Array.isArray(value) ? value : [value];
  return values.filter(v => !isEmptyValue(v) && !known.has(v)).map(String);
}

export function lintAbility(ctx: LintContext): LintItem[] {
  const out: LintItem[] = [];
  const item = ctx.item ?? {};
  const effects: any[] = Array.isArray(item.effects) ? item.effects : [];
  const isModifier = !!item.modifies;

  if (item.requires_status && !isModifier) {
    out.push({ level: 'warn', text: 'requires_status only works on a modifier – it has no effect on a standalone ability.' });
  }
  if (isModifier && !ctx.base) {
    out.push({ level: 'warn', text: `Modifies "${item.modifies}", which no ability template defines.` });
  }
  if (!isModifier && ctx.groupsExist && !item.meta?.group) {
    out.push({ level: 'warn', text: 'No group set – grouped ability UIs in the game leave this ability out.' });
  }

  for (const key in item.meta ?? {}) {
    const value = item.meta[key];
    if (isEmptyValue(value)) continue;
    const field = ctx.metaFields[key];
    if (!field) {
      out.push({ level: 'warn', text: `Meta "${key}" has no ability definition – nothing reads or prints it.` });
      continue;
    }
    const missing = danglingValues(field, value);
    if (missing.length) out.push({ level: 'warn', text: `Meta "${key}" points at ${missing.join(', ')}, which no longer exist.` });
  }

  const idCount = new Map<string, number>();
  for (const effect of effects) idCount.set(effectKey(effect), (idCount.get(effectKey(effect)) ?? 0) + 1);
  for (const [id, count] of idCount) {
    if (count < 2) continue;
    out.push({ level: 'warn', text: id === 'undefined'
      ? `${count} effects have no id – they share one key and all but the last are lost.`
      : `${count} effects share the id "${id}" – all but the last are lost.` });
  }

  const baseEffects = new Map<string, any>();
  for (const effect of ctx.base?.effects ?? []) baseEffects.set(effectKey(effect), effect);

  effects.forEach((effect, effectIndex) => {
    const aspects = effect?.aspects ?? {};
    const label = effect?.id ? `Effect "${effect.id}"` : `Effect ${effectIndex + 1}`;
    const baseAspects = isModifier ? baseEffects.get(effectKey(effect))?.aspects ?? null : null;
    const setKeys = Object.keys(aspects).filter(key => !isEmptyValue(aspects[key]));

    if (!setKeys.length && !plainText(effect?.description_attach)) {
      out.push({ level: 'warn', effectIndex, text: `${label} has no aspects and no attached text – the card leaves it out.` });
    }
    if (isModifier && ctx.base && !baseAspects && !effect?.name) {
      out.push({ level: 'info', effectIndex, text: `${label} adds a new group without a name – it shows as an untitled group.` });
    }

    for (const key of setKeys) {
      const field = ctx.aspectFields[key];
      const def = ctx.defsById.get(key);
      if (!field || !def) {
        out.push({ level: 'warn', effectIndex, text: `${label}: "${key}" has no ability definition – nothing reads or prints it.` });
        continue;
      }
      const owners = ctx.aspectCompanions.ownersOf.get(key);
      if (owners?.length) {
        const ownerSet = owners.some(owner => !isEmptyValue(aspects[owner]) || !isEmptyValue(baseAspects?.[owner]));
        if (!ownerSet) {
          out.push({ level: 'warn', effectIndex, text: `${label}: "${key}" only prints as part of ${owners.map(o => `"${o}"`).join(' or ')}, which this effect does not set.` });
        }
      } else if (!def.ingame_description && !def.ingame_hide && !def.debug_info) {
        out.push({ level: 'info', effectIndex, text: `${label}: "${key}" has no in-game description, so the card never prints it.` });
      }
      const missing = danglingValues(field, aspects[key]);
      if (missing.length) out.push({ level: 'warn', effectIndex, text: `${label}: "${key}" points at ${missing.join(', ')}, which no longer exist.` });
    }
  });

  return out;
}

/** Everything an effect card needs to render and edit aspects. */
export interface AspectContext {
  fields: Schema;
  effectFields: Schema;
  defsById: Map<string, any>;
  companions: CompanionIndex;
  layout: ResolvedLayout;
  labelsFor: (key: string) => Map<string, string> | undefined;
  /** Addable aspects without companions (they come inline with their owner). */
  palette: PaletteGroup[];
  /** Every aspect, for effects merging into a base effect, where a lone companion is a real delta. */
  paletteAll: PaletteGroup[];
}
