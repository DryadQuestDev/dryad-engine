import type { Schemable } from '../../../../utility/schema';
import { isEmptyValue, plainText } from '../../shared/fields/fieldHelpers';

/** What the inventory editor shows and computes for one item template. */
export interface ItemInfo {
  id: string;
  name: string;
  image: string;
  rarity: string;
  category: string;
  /** Item.maxStack(): the max_stack trait, with 0 or unset read as 1 and -1 as unlimited. */
  maxStack: number;
  weight: number;
  price: Record<string, number>;
  description: string;
}

export function itemInfo(template: any): ItemInfo {
  const traits = template?.traits ?? {};
  return {
    id: template?.id ?? '',
    name: (typeof traits.name === 'string' && plainText(traits.name)) || template?.id || '',
    image: typeof traits.image === 'string' ? traits.image : '',
    rarity: typeof traits.rarity === 'string' ? traits.rarity : '',
    category: typeof template?.category === 'string' ? template.category : '',
    maxStack: Number(traits.max_stack) || 1,
    weight: Number(traits.weight) || 0,
    price: template?.price && typeof template.price === 'object' ? template.price : {},
    description: plainText(traits.description),
  };
}

export function stackLabel(maxStack: number): string {
  if (maxStack === -1) return 'unlimited stack';
  if (maxStack <= 1) return 'does not stack';
  return `stacks to ${maxStack}`;
}

/** Whether copies share a stack: an unlimited (-1) or a capped stack above 1. */
export function stacks(maxStack: number): boolean {
  return maxStack === -1 || maxStack > 1;
}

/** createInventory reads `quantity || 1`, so 0 and an empty quantity both add one. */
export function rowQuantity(row: any): number {
  return Number(row?.quantity) || 1;
}

export interface SlotPreview {
  itemId: string;
  quantity: number;
  rowIndex: number;
}

/**
 * The stacks the game creates from the rows, in order — a replay of Inventory.addItem: an
 * unlimited stack (-1) grows one slot, a non-stackable item takes a slot per copy, a capped stack
 * tops off the item's open stacks before starting new ones. Rows naming no known item are
 * skipped (the game throws on them; the warnings say so).
 */
export function simulateSlots(rows: any[], infoOf: (id: string) => ItemInfo | undefined): SlotPreview[] {
  const slots: SlotPreview[] = [];
  rows.forEach((row, rowIndex) => {
    const id = row?.item_id;
    const info = id ? infoOf(id) : undefined;
    if (!info) return;
    let quantity = rowQuantity(row);
    if (quantity <= 0) return;
    const maxStack = info.maxStack;
    if (maxStack === -1) {
      const open = slots.find(slot => slot.itemId === id);
      if (open) open.quantity += quantity;
      else slots.push({ itemId: id, quantity, rowIndex });
      return;
    }
    if (maxStack <= 1) {
      for (let i = 0; i < quantity; i++) slots.push({ itemId: id, quantity: 1, rowIndex });
      return;
    }
    for (const slot of slots) {
      if (quantity <= 0) break;
      if (slot.itemId !== id || slot.quantity >= maxStack) continue;
      const added = Math.min(maxStack - slot.quantity, quantity);
      slot.quantity += added;
      quantity -= added;
    }
    while (quantity > 0) {
      const stack = Math.min(quantity, maxStack);
      slots.push({ itemId: id, quantity: stack, rowIndex });
      quantity -= stack;
    }
  });
  return slots;
}

export interface InventoryTotals {
  copies: number;
  weight: number;
  /** Currency item id -> total price of everything in the inventory. */
  value: Record<string, number>;
}

export function inventoryTotals(rows: any[], infoOf: (id: string) => ItemInfo | undefined): InventoryTotals {
  const totals: InventoryTotals = { copies: 0, weight: 0, value: {} };
  for (const row of rows) {
    const info = row?.item_id ? infoOf(row.item_id) : undefined;
    if (!info) continue;
    const quantity = rowQuantity(row);
    if (quantity <= 0) continue;
    totals.copies += quantity;
    totals.weight += info.weight * quantity;
    for (const currency in info.price) {
      const amount = Number(info.price[currency]);
      if (Number.isFinite(amount)) totals.value[currency] = (totals.value[currency] ?? 0) + amount * quantity;
    }
  }
  totals.weight = Math.round(totals.weight * 1000) / 1000;
  return totals;
}

/** Capacity limit rules of createInventory / Inventory.addItem. */
export function allowsOverCapacity(inventory: any, partyId: string): boolean {
  if (inventory?.allow_over_capacity === true) return true;
  if (inventory?.allow_over_capacity === false) return false;
  return inventory?.id === partyId;
}

export interface InventoryLint {
  level: 'error' | 'warn' | 'info';
  text: string;
  rowIndex?: number;
}

export interface InventoryLintContext {
  inventory: any;
  infoOf: (id: string) => ItemInfo | undefined;
  slotCount: number;
  weight: number;
  partyId: string;
  fields: Record<string, Schemable | undefined>;
}

function dangling(field: Schemable | undefined, value: any): string[] {
  const options = field?.options;
  if (!Array.isArray(options) || !options.length) return [];
  const known = new Set(options.map(option => (option && typeof option === 'object' ? option.value ?? option.id : option)));
  return (Array.isArray(value) ? value : [value]).filter(v => !isEmptyValue(v) && !known.has(v)).map(String);
}

export function lintInventory(ctx: InventoryLintContext): InventoryLint[] {
  const out: InventoryLint[] = [];
  const inventory = ctx.inventory ?? {};
  const rows: any[] = Array.isArray(inventory.items) ? inventory.items : [];
  const seen = new Map<string, number>();

  rows.forEach((row, rowIndex) => {
    const label = `Row ${rowIndex + 1}`;
    const id = row?.item_id;
    if (!id) {
      out.push({ level: 'error', rowIndex, text: `${label} has no item – the game throws when it creates this row's item.` });
      return;
    }
    const info = ctx.infoOf(id);
    if (!info) {
      out.push({ level: 'error', rowIndex, text: `${label}: item "${id}" does not exist – the game throws when it creates this row's item.` });
      return;
    }
    // Non-stacking items take a row per copy, so repeats of them are the intended shape.
    if (stacks(info.maxStack)) seen.set(id, (seen.get(id) ?? 0) + 1);
    const raw = row?.quantity;
    if (typeof raw === 'number' && raw < 0) {
      out.push({ level: 'warn', rowIndex, text: `${label}: a negative quantity adds nothing.` });
    } else if (raw === 0) {
      out.push({ level: 'info', rowIndex, text: `${label}: quantity 0 is read as 1.` });
    }
    const quantity = rowQuantity(row);
    if (!stacks(info.maxStack) && quantity > 1) {
      out.push({ level: 'info', rowIndex, text: `${info.name} does not stack: ${quantity} copies take ${quantity} slots. Split gives each copy its own row.` });
    }
  });

  for (const [id, count] of seen) {
    if (count > 1) out.push({ level: 'info', text: `"${id}" is listed in ${count} rows – they fill the same stacks. Merge duplicates combines them.` });
  }

  const allowed = allowsOverCapacity(inventory, ctx.partyId);
  const maxSize = Number(inventory.max_size) || 0;
  if (maxSize > 0 && ctx.slotCount > maxSize) {
    out.push({ level: allowed ? 'info' : 'warn', text: allowed
      ? `Starts over its slot limit (${ctx.slotCount} of ${maxSize}); over-capacity is allowed, so items can still be added.`
      : `Starts over its slot limit (${ctx.slotCount} of ${maxSize}). Template items skip the limit, but nothing more can be added until it drops below.` });
  }
  const maxWeight = Number(inventory.max_weight) || 0;
  if (maxWeight > 0 && ctx.weight > maxWeight) {
    out.push({ level: allowed ? 'info' : 'warn', text: allowed
      ? `Starts over its weight limit (${ctx.weight} of ${maxWeight}); over-capacity is allowed.`
      : `Starts over its weight limit (${ctx.weight} of ${maxWeight}). Nothing more can be added until it drops below.` });
  }

  for (const key of ['recipes', 'group_recipes']) {
    const missing = dangling(ctx.fields[key], inventory[key]);
    if (missing.length) out.push({ level: 'warn', text: `${key} points at ${missing.join(', ')}, which no longer exist.` });
  }
  for (const key in inventory.traits ?? {}) {
    const field = (ctx.fields.traits as any)?.objects?.[key] as Schemable | undefined;
    if (!field) {
      if (!isEmptyValue(inventory.traits[key])) out.push({ level: 'warn', text: `Trait "${key}" has no inventory trait definition.` });
      continue;
    }
    const missing = dangling(field, inventory.traits[key]);
    if (missing.length) out.push({ level: 'warn', text: `Trait "${key}" points at ${missing.join(', ')}, which no longer exist.` });
  }
  return out;
}
