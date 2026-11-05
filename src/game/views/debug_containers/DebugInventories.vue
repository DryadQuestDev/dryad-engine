<script setup lang="ts">
import { computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import type { Inventory } from '../../core/character/inventory';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';
import DebugChangesBox from './DebugChangesBox.vue';
import DebugEditField from './DebugEditField.vue';
import DebugPicker, { type PickerOption } from './DebugPicker.vue';
import { devChanges, devSet, findDevChange, isInEffect, loadDevChanges, undoDevChanges, type DevChange } from '../../utils/devChanges';

const game = Game.getInstance();

loadDevChanges();

/** One row per item id: stacks of the same item add up, since add_item and remove_item count by id. */
type ItemRow = {
  id: string;
  name: string;
  image: string;
  count: number;
  equipped: boolean;
  /** Removed here this playtest, kept listed so the removal can be seen and put back. */
  removed: boolean;
};

const selectedId = useStorage('debug-inventories-selected', PARTY_INVENTORY_ID);

const inventories = computed<Inventory[]>(() => [...game.itemSystem.inventories.value.values()].sort((a, b) => {
  if (a.id === PARTY_INVENTORY_ID) return -1;
  if (b.id === PARTY_INVENTORY_ID) return 1;
  return a.id.localeCompare(b.id);
}));

// The stored pick can name an inventory this game or this run does not have.
const inventory = computed<Inventory | null>(() =>
  game.itemSystem.inventories.value.get(selectedId.value) ?? inventories.value[0] ?? null);

function templateTraits(itemId: string): Record<string, any> {
  return (game.itemSystem.itemTemplatesMap.get(itemId)?.traits as Record<string, any>) ?? {};
}

const itemChanges = computed<DevChange[]>(() => devChanges.value.filter(c => c.kind === 'item'));

const itemRows = computed<ItemRow[]>(() => {
  const inv = inventory.value;
  if (!inv) return [];
  const rows = new Map<string, ItemRow>();
  for (const item of inv.items) {
    const row = rows.get(item.id);
    if (row) {
      row.count += item.quantity;
      row.equipped ||= item.isEquipped;
      continue;
    }
    rows.set(item.id, {
      id: item.id, name: item.getName(), image: item.getImage(), count: item.quantity, equipped: item.isEquipped, removed: false,
    });
  }
  for (const change of itemChanges.value) {
    if (change.owner !== inv.id || change.value !== 0 || rows.has(change.key) || !isInEffect(change)) continue;
    const traits = templateTraits(change.key);
    rows.set(change.key, { id: change.key, name: traits.name || change.key, image: traits.image || '', count: 0, equipped: false, removed: true });
  }
  return [...rows.values()];
});

const itemOptions = computed<PickerOption[]>(() => [...game.itemSystem.itemTemplatesMap.entries()].map(([id, template]) => {
  const traits = (template.traits as Record<string, any>) ?? {};
  return { id, name: traits.name || id, image: traits.image || undefined };
}));

/** The change behind a row, while the game still holds what it set. */
function activeChange(itemId: string): DevChange | undefined {
  const inv = inventory.value;
  if (!inv) return undefined;
  const change = findDevChange({ kind: 'item', owner: inv.id, key: itemId });
  return change && isInEffect(change) ? change : undefined;
}

function deltaText(change: DevChange): string {
  const delta = Number(change.value) - Number(change.original);
  return delta > 0 ? `+${delta}` : `−${-delta}`;
}

function report(error: string | null) {
  if (error) Global.getInstance().addNotification(error);
}

function setCount(itemId: string, count: number) {
  const inv = inventory.value;
  if (inv) report(devSet({ kind: 'item', owner: inv.id, key: itemId }, Math.max(0, Math.round(count))));
}

function addItem(itemId: string) {
  const row = itemRows.value.find(r => r.id === itemId);
  setCount(itemId, (row?.count ?? 0) + 1);
}

function undoChange(change: DevChange | undefined) {
  if (change) report(undoDevChanges([change]));
}

const exchangeOpen = computed(() => game.getState('overlay_state') === 'overlay-exchange');

// Opens the window the {loot} / {trade} actions open, so closing it continues the scene as it
// would after that action.
function openExchange(mode: 'loot' | 'trade') {
  const inv = inventory.value;
  if (!inv) return;
  try {
    game.openExchange(inv.id, mode);
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
  }
}
</script>

<template>
  <div class="debug-inventories">
    <select class="inventory-select" :value="inventory?.id" :disabled="!inventories.length"
      @change="selectedId = ($event.target as HTMLSelectElement).value">
      <option v-for="inv in inventories" :key="inv.id" :value="inv.id">
        {{ inv.id }} · {{ inv.items.length }} {{ inv.items.length === 1 ? 'item' : 'items' }}
      </option>
    </select>

    <template v-if="inventory">
      <div v-if="inventory.id !== PARTY_INVENTORY_ID" class="exchange-buttons">
        <button class="exchange-button" :disabled="exchangeOpen"
          :title="exchangeOpen ? 'An exchange is already open' : 'Open it as a loot window, like {loot}'"
          @click="openExchange('loot')">
          <i class="pi pi-box"></i> Loot
        </button>
        <button class="exchange-button" :disabled="exchangeOpen"
          :title="exchangeOpen ? 'An exchange is already open' : 'Open it as a trade window, like {trade}'"
          @click="openExchange('trade')">
          <i class="pi pi-shopping-cart"></i> Trade
        </button>
      </div>

      <details class="inventory-details">
        <summary>Details</summary>
        <dl>
          <template v-if="inventory.name && inventory.name !== inventory.id">
            <dt>Name</dt>
            <dd>{{ inventory.name }}</dd>
          </template>
          <dt>Max size</dt>
          <dd>{{ inventory.maxSize === 0 ? 'Unlimited' : inventory.maxSize }}</dd>
          <template v-if="inventory.interactive">
            <dt>Interactive</dt>
            <dd>{{ inventory.interactive }}</dd>
          </template>
          <template v-if="inventory.recipes.size">
            <dt>Recipes</dt>
            <dd>{{ Array.from(inventory.recipes).join(', ') }}</dd>
          </template>
        </dl>
      </details>

      <section class="add-item">
        <h4 class="section-title">Add item</h4>
        <DebugPicker :options="itemOptions" placeholder="Search items" @pick="addItem" />
      </section>

      <div v-if="itemRows.length" class="item-list">
        <div v-for="row in itemRows" :key="row.id" class="item-row"
          :class="{ changed: activeChange(row.id), removed: row.removed }">
          <span class="item-icon">
            <img v-if="row.image" :src="row.image" alt="" />
            <i v-if="row.equipped" class="pi pi-check item-equipped" title="Equipped"></i>
          </span>
          <span class="item-title">
            <span class="item-name">{{ row.name }}</span>
            <code class="item-id" :title="row.id">{{ row.id }}</code>
          </span>
          <span class="item-qty">
            <button class="qty-step" :disabled="row.count === 0" title="Remove one" @click="setCount(row.id, row.count - 1)">
              <i class="pi pi-minus"></i>
            </button>
            <DebugEditField class="qty-input" editor="number" :value="row.count" @commit="setCount(row.id, Number($event))" />
            <button class="qty-step" title="Add one" @click="setCount(row.id, row.count + 1)">
              <i class="pi pi-plus"></i>
            </button>
          </span>
          <span class="item-end">
            <button v-if="activeChange(row.id)" class="item-delta" title="Put it back"
              @click="undoChange(activeChange(row.id))">{{ deltaText(activeChange(row.id)!) }}</button>
            <button v-if="!row.removed" class="item-remove" :title="`Remove every ${row.id}`" @click="setCount(row.id, 0)">
              <i class="pi pi-times"></i>
            </button>
          </span>
        </div>
      </div>
      <p v-else class="empty">This inventory is empty</p>
    </template>
    <p v-else class="empty">No inventories found</p>

    <DebugChangesBox :changes="itemChanges" />
  </div>
</template>

<style scoped>
/* Painted against the host debug panel (Debug.vue), which follows the editor's theme. */
.debug-inventories {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.5rem;
  color: var(--editor-text);
  /* The game sets a large body font; the panel is narrow, so size from the root instead. */
  font-size: 0.875rem;
}

.inventory-select {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 5px;
  background: var(--dp-control-hover, var(--editor-surface));
  color: var(--editor-text);
  font-family: var(--font-family-mono, monospace);
  font-size: 0.95em;
  cursor: pointer;
}

.inventory-select:focus {
  outline: none;
  border-color: var(--editor-accent);
}

.exchange-buttons {
  display: flex;
  gap: 0.4rem;
}

.exchange-button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 5px;
  background: var(--dp-control-hover, var(--editor-surface));
  color: var(--editor-text);
  font: inherit;
  cursor: pointer;
}

.exchange-button:hover:not(:disabled) {
  border-color: var(--editor-accent);
}

.exchange-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.inventory-details summary {
  color: var(--editor-text-muted);
  font-size: 0.9em;
  cursor: pointer;
}

.inventory-details dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.2rem 0.6rem;
  margin: 0.4rem 0 0;
  font-size: 0.9em;
}

.inventory-details dt {
  color: var(--editor-text-muted);
}

.inventory-details dd {
  margin: 0;
  font-family: var(--font-family-mono, monospace);
  overflow-wrap: anywhere;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.item-row {
  display: grid;
  grid-template-columns: 2.4rem minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-left: 4px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
}

.item-row.changed {
  border-left-color: var(--editor-ink-amber);
  background: var(--editor-tint-warning);
}

.item-row.removed .item-name {
  color: var(--editor-text-faint);
  text-decoration: line-through;
}

.item-row.removed .item-icon {
  opacity: 0.45;
}

.item-icon {
  position: relative;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 4px;
  background: #1e293b;
}

.item-icon img {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  object-fit: contain;
}

.item-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.item-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--editor-text-faint);
  font-size: 0.8em;
}

.item-equipped {
  position: absolute;
  right: -0.3rem;
  bottom: -0.3rem;
  padding: 0.15rem;
  border-radius: 50%;
  background: var(--editor-ink-green);
  color: var(--editor-surface);
  font-size: 0.55rem;
}

.item-qty {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--dp-control-hover, var(--editor-surface));
  overflow: hidden;
}

.qty-step {
  padding: 0 0.3rem;
  border: none;
  background: none;
  color: var(--editor-text-muted);
  font-size: 0.7em;
  cursor: pointer;
}

.qty-step:hover:not(:disabled) {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.qty-step:disabled {
  opacity: 0.35;
  cursor: default;
}

.item-qty .qty-input {
  width: 2.2rem;
  padding: 0.15rem 0.2rem;
  border-width: 0 1px;
  border-radius: 0;
  background: transparent;
  font-weight: 700;
  text-align: center !important;
}

.item-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  min-width: 1.2rem;
}

.item-delta {
  padding: 0;
  border: none;
  background: none;
  color: var(--editor-fg-warning);
  font: inherit;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.item-delta:hover {
  text-decoration: line-through;
}

.item-remove {
  padding: 0.1rem 0.2rem;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--editor-text-faint);
  cursor: pointer;
}

.item-remove:hover {
  background: var(--editor-tint-danger);
  color: var(--editor-fg-danger);
}

.add-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.section-title {
  margin: 0.25rem 0 0;
  color: var(--editor-text-muted);
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.empty {
  margin: 0;
  padding: 1rem 0;
  color: var(--editor-text-faint);
  font-style: italic;
  text-align: center;
}
</style>
