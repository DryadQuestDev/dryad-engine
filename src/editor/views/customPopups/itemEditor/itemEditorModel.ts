import type { Schema, Schemable } from '../../../../utility/schema';
import { entityName, idLabel, isEmptyValue } from '../../shared/fields/fieldHelpers';

// ── Where an item is used ──

export interface ItemUsage {
  subTab: string;
  kind: string;
  id: string;
  label: string;
  detail: string;
}

export interface ItemUsageSources {
  inventories: any[];
  recipes: any[];
  characterTemplates: any[];
  itemTemplates: any[];
}

export function findItemUsage(itemId: string | undefined, sources: ItemUsageSources | null): ItemUsage[] {
  if (!itemId || !sources) return [];
  const out: ItemUsage[] = [];
  for (const inventory of sources.inventories) {
    const rows = (inventory?.items ?? []).filter((row: any) => row?.item_id === itemId);
    if (!rows.length) continue;
    const quantity = rows.reduce((sum: number, row: any) => sum + (Number(row.quantity) || 1), 0);
    out.push({ subTab: 'inventories', kind: 'inventory', id: inventory.id, label: idLabel(inventory.id, entityName(inventory)), detail: `×${quantity}` });
  }
  for (const recipe of sources.recipes) {
    const input = (recipe?.input_items ?? []).find((row: any) => row?.item_id === itemId);
    const output = (recipe?.output_items ?? []).find((row: any) => row?.item_id === itemId);
    if (!input && !output) continue;
    const parts = [input ? `needs ${Number(input.quantity) || 1}` : '', output ? `makes ${Number(output.quantity) || 1}` : ''].filter(Boolean);
    out.push({ subTab: 'item_recipes', kind: 'recipe', id: recipe.id, label: idLabel(recipe.id, entityName(recipe)), detail: parts.join(', ') });
  }
  for (const character of sources.characterTemplates) {
    const slots = (character?.item_slots ?? []).filter((slot: any) => slot?.item_default === itemId);
    if (!slots.length) continue;
    out.push({ subTab: 'character_templates', kind: 'character', id: character.id, label: idLabel(character.id, entityName(character)), detail: `starts equipped (${slots.map((slot: any) => slot.slot || slot.id).join(', ')})` });
  }
  for (const item of sources.itemTemplates) {
    if (item?.id === itemId || !item?.price || typeof item.price[itemId] !== 'number') continue;
    out.push({ subTab: 'item_templates', kind: 'priced item', id: item.id, label: idLabel(item.id, entityName(item)), detail: `costs ${item.price[itemId]}` });
  }
  return out;
}

// ── Derived facts ──

/** Item.isConsumable: a status or resource on consume, or a consume script. */
export function isConsumable(item: any): boolean {
  const hasResource = (map: any) => Object.values(map ?? {}).some(value => !!value);
  return (item?.apply_statuses_on_consume?.length ?? 0) > 0
    || hasResource(item?.consume_percentage)
    || hasResource(item?.consume_absolute)
    || !!(item?.actions?.item_consume_before || item?.actions?.item_consume_after);
}

/** What the equip status carries, in words, for the summary line. */
export function equipSummary(status: any): string[] {
  if (!status || typeof status !== 'object') return [];
  const parts: string[] = [];
  const stats = Object.entries(status.stats ?? {}).filter(([, value]) => typeof value === 'number' && value !== 0);
  if (stats.length) parts.push(stats.map(([key, value]) => `${key} ${(value as number) > 0 ? '+' : ''}${value}`).join(', '));
  if (status.abilities?.length) parts.push(`${status.abilities.length} ${status.abilities.length === 1 ? 'ability' : 'abilities'}`);
  if (status.ability_modifiers?.length) parts.push(`${status.ability_modifiers.length} ability ${status.ability_modifiers.length === 1 ? 'modifier' : 'modifiers'}`);
  const traits = Object.keys(status.traits ?? {}).filter(key => !isEmptyValue(status.traits[key]));
  if (traits.length) parts.push(`traits ${traits.join(', ')}`);
  const attributes = Object.entries(status.attributes ?? {}).filter(([, value]) => !isEmptyValue(value));
  if (attributes.length) parts.push(`attributes ${attributes.map(([key, value]) => `${key}=${value}`).join(', ')}`);
  if (status.skin_layers?.length) parts.push(`${status.skin_layers.length} skin ${status.skin_layers.length === 1 ? 'layer' : 'layers'}`);
  return parts;
}

// ── Warnings ──

export interface ItemLint {
  level: 'warn' | 'info';
  text: string;
}

function known(field: Schemable | undefined): Set<any> | null {
  const options = field?.options;
  if (!Array.isArray(options) || !options.length) return null;
  return new Set(options.map(option => (option && typeof option === 'object' ? option.value ?? option.id : option)));
}

function dangling(field: Schemable | undefined, value: any): string[] {
  const set = known(field);
  if (!set) return [];
  return (Array.isArray(value) ? value : [value]).filter(v => !isEmptyValue(v) && !set.has(v)).map(String);
}

export function lintItem(item: any, schema: Schema, categoryIds: Set<string>): ItemLint[] {
  const out: ItemLint[] = [];
  if (!item) return out;

  if (!item.category) out.push({ level: 'info', text: 'No category – the inventory lists it only under All.' });
  else if (categoryIds.size && !categoryIds.has(item.category)) out.push({ level: 'warn', text: `Category "${item.category}" does not exist.` });

  for (const key of ['slots', 'choices', 'learn_recipe'] as const) {
    const missing = dangling(schema[key], item[key]);
    if (missing.length) out.push({ level: 'warn', text: `${key} points at ${missing.join(', ')}, which no longer exist.` });
  }

  const currencies = Object.keys(schema.price?.objects ?? {});
  for (const currency of Object.keys(item.price ?? {})) {
    if (currencies.length && !currencies.includes(currency)) out.push({ level: 'warn', text: `Price uses "${currency}", which is not a currency item.` });
  }

  (item.apply_statuses_on_consume ?? []).forEach((row: any, index: number) => {
    if (!row?.status) out.push({ level: 'warn', text: `Consume row ${index + 1} has no status.` });
    else {
      const missing = dangling((schema.apply_statuses_on_consume as any)?.objects?.status, row.status);
      if (missing.length) out.push({ level: 'warn', text: `Consume row ${index + 1}: status "${row.status}" does not exist.` });
    }
  });
  for (const key of ['consume_percentage', 'consume_absolute'] as const) {
    const stats = Object.keys(schema[key]?.objects ?? {});
    for (const stat of Object.keys(item[key] ?? {})) {
      if (stats.length && !stats.includes(stat)) out.push({ level: 'warn', text: `${key} uses "${stat}", which is not a resource stat.` });
    }
  }

  if (equipSummary(item.status).length && !(item.slots?.length)) {
    out.push({ level: 'warn', text: 'The equip status carries effects, but the item has no slots, so nothing can equip it.' });
  }

  const traitFields = schema.traits?.objects ?? {};
  for (const key of Object.keys(item.traits ?? {})) {
    if (isEmptyValue(item.traits[key])) continue;
    const field = traitFields[key];
    if (!field) {
      out.push({ level: 'warn', text: `Trait "${key}" has no item trait definition.` });
      continue;
    }
    const missing = dangling(field, item.traits[key]);
    if (missing.length) out.push({ level: 'warn', text: `Trait "${key}" points at ${missing.join(', ')}, which no longer exist.` });
  }
  return out;
}
