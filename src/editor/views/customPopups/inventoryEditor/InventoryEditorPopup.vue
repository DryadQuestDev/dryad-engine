<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import { Editor, type EditorCustomPopupProps } from '../../../editor';
import { Global } from '../../../../global/global';
import { PARTY_INVENTORY_ID } from '../../../../game/systems/itemSystem';
import type { Schema, Schemable } from '../../../../utility/schema';
import { ItemTemplateSchema } from '../../../../schemas/itemTemplateSchema';
import { fileOfSubtab, mainTabOf } from '../../../editorJump';
import { hydrateItemPreview } from '../../../gamePreviewHydration';
import { showConfirm } from '../../../../services/dialogService';
import Dsearch from '../../dsearch/Dsearch.vue';
import FieldValueInput from '../../shared/fields/FieldValueInput.vue';
import TagChipsInput from '../../shared/fields/TagChipsInput.vue';
import { entityName, idLabel, isEmptyValue } from '../../shared/fields/fieldHelpers';
import ItemTile from './ItemTile.vue';
import {
  inventoryTotals, itemInfo, lintInventory, rowQuantity, simulateSlots, stackLabel, stacks,
  type InventoryLint, type ItemInfo,
} from './inventoryModel';

/**
 * Inventory template editor: an item pool with the item tab's filter form on the left (click an
 * item to add it, like the ability picker), the inventory's contents with quantities, its
 * properties, capacity and value, and a preview of the stacks the game creates from it.
 */
const props = defineProps<EditorCustomPopupProps>();

const emit = defineEmits<{
  'update:item': [item: any];
  'request-save-jump': [payload: { mainTab: string; subTab: string; entityId: string }];
}>();

const editor = Editor.getInstance();

const localItem = ref<any>(props.item);
watch(() => props.item, (item) => { localItem.value = item; });

function changed() {
  emit('update:item', localItem.value);
}

const schemaAny = computed<any>(() => props.schema ?? {});
const fields = computed<Record<string, Schemable | undefined>>(() => schemaAny.value);
const traitFields = computed<Schema>(() => schemaAny.value.traits?.objects ?? {});
const isParty = computed(() => localItem.value?.id === PARTY_INVENTORY_ID);

// ── Data ──
const ready = ref(false);
const loadError = ref('');
const templates = shallowRef<any[]>([]);
const categories = shallowRef<any[]>([]);
const recipes = shallowRef<any[]>([]);
const recipeGroups = shallowRef<any[]>([]);
const allInventories = shallowRef<any[]>([]);
const itemSchema = shallowRef<Schema | null>(null);
const jumpableItems = shallowRef(new Set<string>());
// The game's item hover cards need the editor-only game copy hydrated; until then (or if it
// fails) tiles fall back to a text tooltip.
const cardsReady = ref(false);

onMounted(async () => {
  try {
    const [itemRows, categoryRows, recipeRows, groupRows, inventoryRows] = await Promise.all([
      editor.loadFullData('item_templates'),
      editor.loadFullData('item_categories').catch(() => []),
      editor.loadFullData('item_recipes').catch(() => []),
      editor.loadFullData('recipe_groups').catch(() => []),
      editor.loadFullData(fileOfSubtab(props.subtabId) ?? 'item_inventories').catch(() => []),
    ]);
    templates.value = itemRows.filter((row: any) => row?.id);
    categories.value = categoryRows;
    recipes.value = recipeRows;
    recipeGroups.value = groupRows;
    allInventories.value = inventoryRows;
    // The item tab's own filter form (search, ranges, selections, tags), presets included.
    itemSchema.value = await editor.prepareSchema(ItemTemplateSchema as unknown as Schema);
    try {
      const own = await Global.getInstance().readJson(
        `games_files/${editor.selectedGame}/${editor.selectedMod}/${fileOfSubtab('item_templates') ?? 'item_templates'}.json`) as any[];
      jumpableItems.value = new Set(Array.isArray(own) ? own.map((row: any) => row.id) : []);
    } catch { /* the folder has no item file of its own – jumps stay off */ }
    ready.value = true;
    hydrateItemPreview()
      .then(() => { cardsReady.value = true; })
      .catch((e) => console.warn('[InventoryEditor] item cards unavailable:', e));
  } catch (e) {
    console.error('[InventoryEditor] load failed:', e);
    loadError.value = String(e);
  }
});

const infoById = computed(() => new Map<string, ItemInfo>(templates.value.map(template => [template.id, itemInfo(template)])));
const infoOf = (id: string) => infoById.value.get(id);

const categoryOrder = computed(() => {
  const order = new Map<string, number>();
  [...categories.value]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .forEach((category, index) => order.set(category.id, index));
  return order;
});
const categoryById = computed(() => new Map<string, any>(categories.value.map(category => [category.id, category])));

function categoryIcon(info: ItemInfo | undefined): string | undefined {
  return info ? categoryById.value.get(info.category)?.icon || undefined : undefined;
}

// ── Contents ──
const rows = computed<any[]>(() => Array.isArray(localItem.value?.items) ? localItem.value.items : []);

function ensureRows(): any[] {
  if (!Array.isArray(localItem.value.items)) localItem.value.items = [];
  return localItem.value.items;
}

const quantityById = computed(() => {
  const map = new Map<string, number>();
  for (const row of rows.value) {
    if (row?.item_id) map.set(row.item_id, (map.get(row.item_id) ?? 0) + rowQuantity(row));
  }
  return map;
});

/** A known item that takes a slot per copy; its rows hold one copy each. */
function isSingle(id: string): boolean {
  const info = infoOf(id);
  return !!info && !stacks(info.maxStack);
}

function addItem(id: string, event?: MouseEvent) {
  const info = infoOf(id);
  const amount = event?.shiftKey && info && info.maxStack > 1 ? info.maxStack : 1;
  const list = ensureRows();
  const existing = isSingle(id) ? undefined : list.find(row => row?.item_id === id);
  if (existing) existing.quantity = rowQuantity(existing) + amount;
  else list.push({ uid: editor.createUid(), item_id: id, quantity: amount });
  highlight.value = id;
  changed();
}

function setQuantity(row: any, value: number | null) {
  row.quantity = value === null || value === undefined ? 1 : value;
  changed();
}

function splitRow(index: number) {
  const row = rows.value[index];
  const copies = Array.from({ length: rowQuantity(row) - 1 }, () => ({ ...row, uid: editor.createUid(), quantity: 1 }));
  row.quantity = 1;
  rows.value.splice(index + 1, 0, ...copies);
  changed();
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
  if (!rows.value.length) delete localItem.value.items;
  changed();
}

function moveRow(index: number, delta: number) {
  const list = rows.value;
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  changed();
}

const hasDuplicates = computed(() => rows.value.some((row, i) =>
  row?.item_id && !isSingle(row.item_id) && rows.value.findIndex(other => other?.item_id === row.item_id) !== i));

function mergeDuplicates() {
  const merged: any[] = [];
  for (const row of rows.value) {
    const first = row?.item_id && !isSingle(row.item_id) ? merged.find(other => other.item_id === row.item_id) : undefined;
    if (first) first.quantity = rowQuantity(first) + rowQuantity(row);
    else merged.push(row);
  }
  localItem.value.items = merged;
  changed();
}

function sortRows() {
  const orderOf = (row: any) => categoryOrder.value.get(infoOf(row?.item_id)?.category ?? '') ?? 999;
  localItem.value.items = [...rows.value].sort((a, b) =>
    orderOf(a) - orderOf(b) || (infoOf(a?.item_id)?.name ?? '').localeCompare(infoOf(b?.item_id)?.name ?? ''));
  changed();
}

async function clearRows() {
  const ok = await showConfirm({ header: 'Clear contents', message: `Remove all ${rows.value.length} rows from this inventory?`, acceptLabel: 'Clear' });
  if (!ok) return;
  delete localItem.value.items;
  changed();
}

const highlight = ref<string | null>(null);

// ── Capacity, value, preview ──
const slots = computed(() => simulateSlots(rows.value, infoOf));
const totals = computed(() => inventoryTotals(rows.value, infoOf));
const maxSize = computed(() => Number(localItem.value?.max_size) || 0);
const maxWeight = computed(() => Number(localItem.value?.max_weight) || 0);

const PREVIEW_CELLS = 160;
const previewCells = computed(() => {
  const count = Math.min(Math.max(slots.value.length, maxSize.value), PREVIEW_CELLS);
  return Array.from({ length: count }, (_, i) => slots.value[i] ?? null);
});

function meterStyle(used: number, limit: number) {
  if (!limit) return { width: '0%' };
  return { width: `${Math.min(100, (used / limit) * 100)}%` };
}

function currencyInfo(id: string): ItemInfo | undefined {
  return infoOf(id);
}

// ── Warnings ──
const lint = computed<InventoryLint[]>(() => ready.value ? lintInventory({
  inventory: localItem.value,
  infoOf,
  slotCount: slots.value.length,
  weight: totals.value.weight,
  partyId: PARTY_INVENTORY_ID,
  fields: fields.value,
}) : []);

const rowLevels = computed(() => {
  const map = new Map<number, 'error' | 'warn' | 'info'>();
  for (const item of lint.value) {
    if (item.rowIndex === undefined) continue;
    const current = map.get(item.rowIndex);
    if (!current || item.level === 'error' || (item.level === 'warn' && current === 'info')) map.set(item.rowIndex, item.level);
  }
  return map;
});

// ── Properties ──
const PROPERTY_KEYS = ['name', 'max_size', 'max_weight', 'interactive', 'auto_create', 'allow_over_capacity', 'recipes', 'group_recipes'];
const propertyKeys = computed(() => PROPERTY_KEYS.filter(key => fields.value[key]));
const propertiesOpen = useStorage('inventory-editor-properties-open', true);

function setProperty(key: string, value: any) {
  if (isEmptyValue(value) || value === false) delete localItem.value[key];
  else localItem.value[key] = value;
  changed();
}

function setTrait(key: string, value: any) {
  if (!localItem.value.traits || typeof localItem.value.traits !== 'object') localItem.value.traits = {};
  if (isEmptyValue(value) || value === false) delete localItem.value.traits[key];
  else localItem.value.traits[key] = value;
  if (!Object.keys(localItem.value.traits).length) delete localItem.value.traits;
  changed();
}

function setId(value: string | undefined) {
  if (value) localItem.value.id = value; else delete localItem.value.id;
  changed();
}

function setTags(value: string[]) {
  if (value.length) localItem.value.tags = value; else delete localItem.value.tags;
  changed();
}

const tagSuggestions = computed(() => {
  const tags = new Set<string>();
  for (const inventory of allInventories.value) for (const tag of inventory?.tags ?? []) tags.add(tag);
  return [...tags].sort();
});

function labelsOf(rowsOf: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rowsOf) {
    const name = entityName(row);
    if (row?.id && name) map.set(row.id, name);
  }
  return map;
}
const recipeLabels = computed(() => labelsOf(recipes.value));
const groupLabels = computed(() => labelsOf(recipeGroups.value));

function labelsFor(key: string): Map<string, string> | undefined {
  if (key === 'recipes') return recipeLabels.value;
  if (key === 'group_recipes') return groupLabels.value;
  return undefined;
}

// What a crafting station ends up offering: its own recipes plus every recipe whose
// recipe_group is one of its groups (ItemSystem.resolveTemplateRecipes).
const stationRecipes = computed<string[]>(() => {
  const ids = new Set<string>(localItem.value?.recipes ?? []);
  const groups = new Set<string>(localItem.value?.group_recipes ?? []);
  if (groups.size) {
    for (const recipe of recipes.value) if (recipe?.recipe_group && groups.has(recipe.recipe_group)) ids.add(recipe.id);
  }
  return [...ids];
});

// ── Item pool (left filter form, category chips, click to add) ──
const siftedIds = ref<Set<string> | null>(null);
const clearCounter = ref(0);
function onSifted(sifted: any[]) {
  siftedIds.value = new Set(sifted.map((row: any) => row.id));
}

const QUEST = '__quest';
const NO_CATEGORY = '__none';
const poolCategory = useStorage('inventory-editor-pool-category', 'all');

const poolInfos = computed(() => templates.value
  .map(template => infoById.value.get(template.id)!)
  .filter(info => siftedIds.value?.has(info.id) ?? true));

const categoryChips = computed(() => {
  const present = new Set(templates.value.map(template => template.category || NO_CATEGORY));
  const chips = [...categories.value]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter(category => present.has(category.id))
    .map(category => ({ id: category.id, label: category.name || category.id, icon: category.icon || '' }));
  if (present.has(NO_CATEGORY)) chips.push({ id: NO_CATEGORY, label: 'No category', icon: '' });
  if (templates.value.some(template => template?.traits?.rarity === 'quest')) chips.push({ id: QUEST, label: 'Quest', icon: '' });
  return chips;
});

function inChip(info: ItemInfo, chip: string): boolean {
  if (chip === 'all') return true;
  if (chip === QUEST) return info.rarity === 'quest';
  if (chip === NO_CATEGORY) return !info.category;
  return info.category === chip;
}

const poolSections = computed(() => {
  const byName = (a: ItemInfo, b: ItemInfo) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const chip = poolCategory.value;
  const visible = poolInfos.value.filter(info => inChip(info, chip));
  if (chip !== 'all') return [{ key: chip, label: '', items: [...visible].sort(byName) }];
  const sections = new Map<string, ItemInfo[]>();
  for (const info of visible) {
    const key = info.category && categoryById.value.has(info.category) ? info.category : NO_CATEGORY;
    const list = sections.get(key) ?? [];
    list.push(info);
    sections.set(key, list);
  }
  return [...sections.entries()]
    .sort((a, b) => (categoryOrder.value.get(a[0]) ?? 999) - (categoryOrder.value.get(b[0]) ?? 999))
    .map(([key, items]) => ({
      key,
      label: key === NO_CATEGORY ? 'No category' : categoryById.value.get(key)?.name || key,
      items: items.sort(byName),
    }));
});

const poolCount = computed(() => poolSections.value.reduce((sum, section) => sum + section.items.length, 0));

function openItem(id: string) {
  const mainTab = mainTabOf('item_templates');
  if (mainTab) emit('request-save-jump', { mainTab, subTab: 'item_templates', entityId: id });
}

function idOf(row: any): string {
  return row?.item_id ?? '';
}

const idInputId = `ie-id-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <div class="inventory-editor">
    <div v-if="loadError" class="ie-message error">Failed to load item data: {{ loadError }}</div>
    <div v-else-if="!ready" class="ie-message">Loading items…</div>

    <div v-else class="ie-body">
      <aside class="ie-filters">
        <Dsearch v-if="itemSchema" :schema="itemSchema" :data="templates" :triggerClear="clearCounter"
          :sync-shared-id-filter="false" preset-scope="item_templates" @update:siftedData="onSifted" />
      </aside>

      <main class="ie-pool">
        <div class="ie-pool-head">
          <div class="ie-chips">
            <button type="button" class="ie-chip" :class="{ on: poolCategory === 'all' }" @click="poolCategory = 'all'">All</button>
            <button v-for="chip in categoryChips" :key="chip.id" type="button" class="ie-chip"
              :class="{ on: poolCategory === chip.id }" @click="poolCategory = chip.id">
              <img v-if="chip.icon" :src="chip.icon" alt="" class="ie-chip-icon" />{{ chip.label }}
            </button>
          </div>
          <span class="ie-pool-count">{{ poolCount }} of {{ templates.length }} items · click adds one, Shift+click a
            full stack</span>
        </div>
        <div class="ie-pool-scroll">
          <section v-for="section in poolSections" :key="section.key" class="ie-pool-section">
            <h4 v-if="section.label" class="ie-pool-title">{{ section.label }} <span>{{ section.items.length }}</span></h4>
            <div class="ie-pool-grid">
              <div v-for="info in section.items" :key="info.id" class="ie-pool-cell"
                :class="{ held: quantityById.has(info.id) }" @click="(e: MouseEvent) => addItem(info.id, e)">
                <ItemTile :info="info" :item-id="info.id" size="lg" :category-icon="categoryIcon(info)"
                  :badge="quantityById.has(info.id) ? `×${quantityById.get(info.id)}` : undefined"
                  :popover="cardsReady ? 'hover' : undefined" />
                <span class="ie-pool-name">{{ info.name }}</span>
                <code class="ie-pool-id">{{ info.id }}</code>
                <button v-if="jumpableItems.has(info.id)" type="button" class="ie-pool-open"
                  v-tooltip.top="'Save, then open this item template'" @click.stop="openItem(info.id)">✎</button>
              </div>
            </div>
          </section>
          <div v-if="!poolCount" class="ie-empty">No items match the filters.</div>
        </div>
      </main>

      <section class="ie-inventory">
        <div class="ie-panel">
          <button type="button" class="ie-panel-head" @click="propertiesOpen = !propertiesOpen">
            <span class="pi" :class="propertiesOpen ? 'pi-chevron-down' : 'pi-chevron-right'" />
            Inventory
            <code class="ie-head-id">{{ localItem.id }}</code>
            <span v-if="isParty" class="ie-party" v-tooltip.top="'The party inventory: these items are the player\'s starting items.'">party</span>
          </button>
          <div v-show="propertiesOpen" class="ie-props">
            <FloatLabel variant="on" class="ie-prop wide" v-tooltip.top="fields.id?.tooltip">
              <InputText :id="idInputId" :modelValue="localItem.id ?? ''" size="small"
                @update:modelValue="(v: string | undefined) => setId(v)" />
              <label :for="idInputId">id</label>
            </FloatLabel>
            <div v-for="key in propertyKeys" :key="key" class="ie-prop"
              :class="{ wide: ['recipes', 'group_recipes', 'name'].includes(key) }">
              <FieldValueInput :field="fields[key]!" :field-key="key" :modelValue="localItem[key]"
                @update:modelValue="(v: any) => setProperty(key, v)" :label="key" :labels="labelsFor(key)"
                :holder="localItem" :holder-schema="schemaAny" />
            </div>
            <div v-for="(field, key) in traitFields" :key="`t-${key}`" class="ie-prop">
              <FieldValueInput :field="field" :field-key="String(key)" :modelValue="localItem.traits?.[key]"
                @update:modelValue="(v: any) => setTrait(String(key), v)" :label="`trait: ${key}`"
                :holder="localItem.traits ?? {}" :holder-schema="traitFields" />
            </div>
            <div v-if="fields.tags" class="ie-prop wide" v-tooltip.top="fields.tags.tooltip">
              <TagChipsInput :modelValue="localItem.tags" :suggestions="tagSuggestions" placeholder="tags"
                @update:modelValue="setTags" />
            </div>
            <div v-if="stationRecipes.length" class="ie-prop wide ie-recipes">
              <span class="ie-recipes-title">Crafts {{ stationRecipes.length }} {{ stationRecipes.length === 1 ? 'recipe' : 'recipes' }}</span>
              <span v-for="id in stationRecipes" :key="id" class="ie-recipe">{{ idLabel(id, recipeLabels.get(id)) }}</span>
            </div>
          </div>
        </div>

        <div class="ie-panel ie-capacity">
          <div class="ie-meter-row">
            <span class="ie-meter-label">Slots</span>
            <div class="ie-meter"><div class="ie-meter-fill" :class="{ over: maxSize && slots.length > maxSize }"
                :style="meterStyle(slots.length, maxSize)" /></div>
            <span class="ie-meter-value">{{ slots.length }}{{ maxSize ? ` / ${maxSize}` : '' }}</span>
          </div>
          <div class="ie-meter-row">
            <span class="ie-meter-label">Weight</span>
            <div class="ie-meter"><div class="ie-meter-fill" :class="{ over: maxWeight && totals.weight > maxWeight }"
                :style="meterStyle(totals.weight, maxWeight)" /></div>
            <span class="ie-meter-value">{{ totals.weight }}{{ maxWeight ? ` / ${maxWeight}` : '' }}</span>
          </div>
          <div class="ie-value">
            <span class="ie-meter-label">Value</span>
            <span v-if="!Object.keys(totals.value).length" class="ie-muted">no priced items</span>
            <span v-for="(amount, currency) in totals.value" :key="currency" class="ie-currency">
              <img v-if="currencyInfo(String(currency))?.image" :src="currencyInfo(String(currency))!.image" alt="" />
              {{ Math.round(amount * 100) / 100 }} {{ currencyInfo(String(currency))?.name ?? currency }}
            </span>
            <span class="ie-muted">· {{ totals.copies }} {{ totals.copies === 1 ? 'item' : 'items' }}</span>
          </div>
        </div>

        <div v-if="lint.length" class="ie-lint">
          <div v-for="(item, i) in lint" :key="i" class="ie-lint-line" :class="item.level">
            <span class="pi" :class="item.level === 'info' ? 'pi-info-circle' : 'pi-exclamation-triangle'" />
            {{ item.text }}
          </div>
        </div>

        <div class="ie-panel ie-contents">
          <div class="ie-contents-head">
            <span class="ie-panel-title">Contents <span class="ie-muted">{{ rows.length }}</span></span>
            <span class="ie-spacer" />
            <Button v-if="hasDuplicates" label="Merge duplicates" size="small" text @click="mergeDuplicates" />
            <Button v-if="rows.length > 1" label="Sort" icon="pi pi-sort-alt" size="small" text
              v-tooltip.top="'By category order, then name. Row order is the order the game adds them in.'"
              @click="sortRows" />
            <Button v-if="rows.length" label="Clear" size="small" text severity="danger" @click="clearRows" />
          </div>
          <div v-if="!rows.length" class="ie-empty">Empty. Click items on the left to add them.</div>
          <div v-for="(row, index) in rows" :key="row.uid ?? index" class="ie-row"
            :class="[rowLevels.get(index), { lit: highlight === idOf(row) }]" @mouseenter="highlight = idOf(row) || null">
            <ItemTile :info="infoOf(idOf(row))" :item-id="idOf(row) || '?'" size="sm"
              :quantity="rowQuantity(row)" :popover="cardsReady ? 'pin' : undefined" />
            <div class="ie-row-main">
              <span class="ie-row-name">{{ infoOf(idOf(row))?.name ?? (idOf(row) || '(no item)') }}</span>
              <span class="ie-row-meta">
                <code>{{ idOf(row) }}</code>
                <template v-if="infoOf(idOf(row))">
                  · {{ stackLabel(infoOf(idOf(row))!.maxStack) }}
                  <template v-if="infoOf(idOf(row))!.weight"> · {{ infoOf(idOf(row))!.weight }} wt</template>
                </template>
              </span>
            </div>
            <span v-if="isSingle(idOf(row))" class="ie-qty ie-qty-single">
              <Button v-if="rowQuantity(row) > 1" :label="`Split ${rowQuantity(row)}`" size="small" text
                v-tooltip.top="'Does not stack: give each copy its own row'" @click="splitRow(index)" />
              <span v-else class="ie-muted" v-tooltip.top="'Does not stack: click the item again for another copy'">1</span>
            </span>
            <InputNumber v-else :modelValue="row.quantity ?? 1" @update:modelValue="(v: number | null) => setQuantity(row, v)"
              @input="(e: any) => typeof e.value === 'number' && setQuantity(row, e.value)" showButtons
              buttonLayout="horizontal" :min="1" :useGrouping="false" size="small" class="ie-qty" inputClass="ie-qty-input"
              incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus" />
            <span class="ie-row-actions">
              <Button icon="pi pi-angle-up" text rounded size="small" severity="secondary" :disabled="index === 0"
                v-tooltip.top="'Earlier: added first'" @click="moveRow(index, -1)" />
              <Button icon="pi pi-angle-down" text rounded size="small" severity="secondary"
                :disabled="index === rows.length - 1" @click="moveRow(index, 1)" />
              <Button v-if="jumpableItems.has(idOf(row))" icon="pi pi-external-link" text rounded size="small"
                severity="secondary" v-tooltip.top="'Save, then open this item template'" @click="openItem(idOf(row))" />
              <Button icon="pi pi-times" text rounded size="small" severity="danger" v-tooltip.top="'Remove row'"
                @click="removeRow(index)" />
            </span>
          </div>
        </div>

        <div class="ie-panel">
          <span class="ie-panel-title">As the game fills it
            <span class="ie-muted">{{ slots.length }} {{ slots.length === 1 ? 'slot' : 'slots' }}</span></span>
          <div class="ie-slots">
            <template v-for="(slot, i) in previewCells" :key="i">
              <ItemTile v-if="slot" :info="infoOf(slot.itemId)" :item-id="slot.itemId" :quantity="slot.quantity" size="sm"
                :over="!!maxSize && i >= maxSize" :class="{ lit: highlight === slot.itemId }"
                :popover="cardsReady ? 'pin' : undefined" @mouseenter="highlight = slot.itemId" />
              <span v-else class="ie-slot-empty" />
            </template>
            <span v-if="Math.max(slots.length, maxSize) > PREVIEW_CELLS" class="ie-muted">…</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.inventory-editor {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ie-message {
  padding: 2rem;
  text-align: center;
  color: var(--editor-text-muted);
}

.ie-message.error {
  color: var(--editor-fg-danger);
}

.ie-body {
  display: flex;
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
}

.ie-filters {
  flex: 0 0 260px;
  overflow-y: auto;
  min-height: 0;
}

/* ── Pool ── */
.ie-pool {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: #16181d;
  border-radius: 8px;
  padding: 0.6rem 0.7rem;
}

.ie-pool-head {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.ie-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.ie-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font: inherit;
  font-size: 0.8rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  border: 1px solid #3a3f4b;
  background: transparent;
  color: #c9ced8;
  cursor: pointer;
}

.ie-chip.on {
  border-color: #ff8a50;
  color: #ffab91;
  background: rgba(255, 87, 34, 0.12);
}

.ie-chip-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.ie-pool-count {
  font-size: 0.75rem;
  color: #8b93a3;
}

.ie-pool-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.ie-pool-section {
  margin-bottom: 0.8rem;
}

.ie-pool-title {
  margin: 0 0 0.45rem;
  font-size: 0.8rem;
  color: #bbb;
  border-bottom: 1px solid #333;
  padding-bottom: 0.2rem;
}

.ie-pool-title span {
  color: #777;
  font-weight: normal;
}

.ie-pool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 0.5rem;
}

.ie-pool-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.35rem 0.2rem;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  min-width: 0;
}

.ie-pool-cell:hover {
  border-color: rgba(255, 87, 34, 0.55);
  background: rgba(255, 87, 34, 0.06);
}

.ie-pool-cell.held {
  background: rgba(255, 87, 34, 0.08);
}

.ie-pool-name {
  font-size: 0.75rem;
  color: #e6edf3;
  text-align: center;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ie-pool-id {
  font-size: 0.62rem;
  line-height: 1.4;
  padding-bottom: 1px;
  color: #7d8594;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: none;
}

.ie-pool-open {
  position: absolute;
  top: 2px;
  left: 2px;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #ddd;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0 0.3rem;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ie-pool-cell:hover .ie-pool-open {
  opacity: 1;
}

/* ── Inventory column ── */
.ie-inventory {
  flex: 0 0 440px;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-right: 0.2rem;
}

.ie-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  background: var(--editor-surface-raised);
  border: 1px solid var(--editor-border);
  border-radius: 6px;
}

.ie-panel-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--editor-text);
  cursor: pointer;
  text-align: left;
}

.ie-panel-head .pi {
  font-size: 0.7rem;
  color: var(--editor-text-muted);
}

.ie-head-id {
  font-weight: normal;
}

.ie-party {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--editor-tint-info);
  color: var(--editor-fg-info);
}

.ie-panel-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--editor-text);
}

.ie-muted {
  font-weight: normal;
  font-size: 0.78rem;
  color: var(--editor-text-muted);
}

.ie-props {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem 0.6rem;
  padding-top: 0.3rem;
}

.ie-prop {
  min-width: 0;
}

.ie-prop.wide {
  grid-column: 1 / -1;
}

.ie-prop :deep(input) {
  width: 100%;
}

.ie-recipes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}

.ie-recipes-title {
  font-size: 0.78rem;
  color: var(--editor-text-muted);
  margin-right: 0.2rem;
}

.ie-recipe {
  font-size: 0.75rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.ie-capacity {
  gap: 0.35rem;
}

.ie-meter-row,
.ie-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.ie-value {
  flex-wrap: wrap;
}

.ie-meter-label {
  flex: 0 0 3.4rem;
  color: var(--editor-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ie-meter {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--editor-surface-sunken);
  border: 1px solid var(--editor-border);
  overflow: hidden;
}

.ie-meter-fill {
  height: 100%;
  background: var(--editor-ink-green);
}

.ie-meter-fill.over {
  background: var(--editor-fg-danger);
}

.ie-meter-value {
  flex: 0 0 auto;
  min-width: 4.5rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--editor-text);
}

.ie-currency {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--editor-text);
}

.ie-currency img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.ie-lint {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.45rem 0.7rem;
  background: var(--editor-tint-warning);
  border-left: 4px solid var(--editor-ink-orange);
  border-radius: 4px;
}

.ie-lint-line {
  font-size: 0.8rem;
  color: var(--editor-text);
}

.ie-lint-line .pi {
  font-size: 0.75rem;
  margin-right: 0.3rem;
}

.ie-lint-line.error .pi {
  color: var(--editor-fg-danger);
}

.ie-lint-line.warn .pi {
  color: var(--editor-fg-warning);
}

.ie-lint-line.info .pi {
  color: var(--editor-fg-info);
}

.ie-contents {
  gap: 0.3rem;
}

.ie-contents-head {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.ie-spacer {
  flex: 1;
}

.ie-empty {
  font-size: 0.82rem;
  color: var(--editor-text-muted);
  font-style: italic;
  padding: 0.4rem 0.2rem;
}

.ie-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.3rem;
  border-radius: 5px;
  border-left: 3px solid transparent;
}

.ie-row:hover,
.ie-row.lit {
  background: var(--editor-surface-hover);
}

.ie-row.error {
  border-left-color: var(--editor-fg-danger);
}

.ie-row.warn {
  border-left-color: var(--editor-fg-warning);
}

.ie-row.info {
  border-left-color: var(--editor-fg-info);
}

.ie-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ie-row-name {
  font-size: 0.85rem;
  color: var(--editor-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ie-row-meta {
  font-size: 0.7rem;
  color: var(--editor-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ie-row-meta code {
  font-size: 0.68rem;
}

.ie-qty {
  flex: 0 0 auto;
}

.ie-qty-single {
  width: 6.8rem;
  text-align: center;
}

.ie-qty :deep(.ie-qty-input) {
  width: 3.2rem;
  text-align: center;
  padding: 0.2rem 0.3rem;
}

.ie-qty :deep(.p-inputnumber-button) {
  width: 1.6rem;
}

.ie-row-actions {
  display: inline-flex;
  opacity: 0.35;
  transition: opacity 0.15s ease;
}

.ie-row:hover .ie-row-actions,
.ie-row:focus-within .ie-row-actions {
  opacity: 1;
}

.ie-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0.4rem;
  border-radius: 6px;
  background: #16181d;
}

.ie-slots :deep(.item-tile.lit) {
  box-shadow: 0 0 0 2px #ff8a50;
}

.ie-slot-empty {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px dashed #3a3f4b;
}

@media (max-width: 1150px) {
  .ie-body {
    flex-direction: column;
    overflow-y: auto;
  }

  .ie-filters,
  .ie-pool,
  .ie-inventory {
    flex: 0 0 auto;
    overflow: visible;
  }

  .ie-pool-scroll {
    max-height: 60vh;
  }
}
</style>
