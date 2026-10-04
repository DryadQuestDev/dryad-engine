<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { watchDebounced } from '@vueuse/core';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import { Editor, type EditorCustomPopupProps } from '../../../editor';
import { Global } from '../../../../global/global';
import { Game } from '../../../../game/game';
import type { Schema, Schemable } from '../../../../utility/schema';
import type { Item } from '../../../../game/core/character/item';
import ItemCard from '../../../../game/views/progression/ItemCard.vue';
import { createPreviewItemFrom, hydrateItemPreview, type AbilityPreviewData } from '../../../gamePreviewHydration';
import { emptyLayout, loadEditorLayouts, resolveLayout, type ResolvedLayout } from '../../../editorLayouts';
import { fileOfSubtab, mainTabOf } from '../../../editorJump';
import FieldGroupsPanel from '../../shared/fields/FieldGroupsPanel.vue';
import FieldValueInput from '../../shared/fields/FieldValueInput.vue';
import NumberMapInput from '../../shared/fields/NumberMapInput.vue';
import TagChipsInput from '../../shared/fields/TagChipsInput.vue';
import { entityName, isEmptyValue } from '../../shared/fields/fieldHelpers';
import ItemTile from '../inventoryEditor/ItemTile.vue';
import { itemInfo, stackLabel } from '../inventoryEditor/inventoryModel';
import { equipSummary, findItemUsage, isConsumable, lintItem, type ItemLint, type ItemUsage } from './itemEditorModel';

/**
 * Item template editor: identity and category, the item's traits in the editor layout's groups,
 * trade, equip and consume fields, its scripts, and the game's own item card rendered live
 * beside them, with every inventory, recipe, character and price that uses the item.
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
const fields = computed<Schema>(() => schemaAny.value);
const traitFields = computed<Schema>(() => schemaAny.value.traits?.objects ?? {});
const actionFields = computed<Schema>(() => schemaAny.value.actions?.objects ?? {});
const tabFile = fileOfSubtab(props.subtabId) ?? props.subtabId;

// ── Data ──
const ready = ref(false);
const loadError = ref('');
const preview = shallowRef<AbilityPreviewData | null>(null);
const categories = shallowRef<any[]>([]);
const traitDefs = shallowRef(new Map<string, any>());
const inventories = shallowRef<any[]>([]);
const recipes = shallowRef<any[]>([]);
const choiceRows = shallowRef<any[]>([]);
const slotRows = shallowRef<any[]>([]);
const traitLayout = shallowRef<ResolvedLayout>(emptyLayout());
const fromFileLabels = shallowRef(new Map<string, Map<string, string>>());
const jumpable = shallowRef(new Map<string, Set<string>>());

const load = (file: string) => editor.loadFullData(file).catch(() => [] as any[]);

onMounted(async () => {
  try {
    const hydrated = await hydrateItemPreview();
    preview.value = hydrated;
    const [categoryRows, traitRows, inventoryRows, recipeRows, choices, slots, layouts] = await Promise.all([
      load('item_categories'), load('item_traits'), load(fileOfSubtab('inventories') ?? 'item_inventories'),
      load('item_recipes'), load('custom_choices'), load('item_slots'), loadEditorLayouts(editor),
    ]);
    categories.value = [...categoryRows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    traitDefs.value = new Map(traitRows.filter((row: any) => row?.id).map((row: any) => [row.id, row]));
    inventories.value = inventoryRows;
    recipes.value = recipeRows;
    choiceRows.value = choices;
    slotRows.value = slots;
    traitLayout.value = resolveLayout(layouts, `${tabFile}:traits`);
    fromFileLabels.value = await buildTraitLabels(traitRows);
    jumpable.value = await loadJumpable();
    ready.value = true;
    refreshPreview();
  } catch (e) {
    console.error('[ItemEditor] load failed:', e);
    loadError.value = String(e);
  }
});

async function buildTraitLabels(traitRows: any[]): Promise<Map<string, Map<string, string>>> {
  const maps = new Map<string, Map<string, string>>();
  for (const def of traitRows) {
    if (typeof def?.fromFile !== 'string' || !def.fromFile || maps.has(def.fromFile)) continue;
    maps.set(def.fromFile, labelsOf(await load(def.fromFile)));
  }
  return maps;
}

async function loadJumpable(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  for (const subTab of ['inventories', 'item_recipes', 'character_templates', 'item_templates']) {
    try {
      const rows = await Global.getInstance().readJson(
        `games_files/${editor.selectedGame}/${editor.selectedMod}/${fileOfSubtab(subTab) ?? subTab}.json`) as any[];
      map.set(subTab, new Set(Array.isArray(rows) ? rows.map((row: any) => row.id) : []));
    } catch {
      map.set(subTab, new Set());
    }
  }
  return map;
}

function labelsOf(rows: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = entityName(row);
    if (row?.id && name) map.set(row.id, name);
  }
  return map;
}

const itemTemplates = computed<any[]>(() => preview.value?.itemTemplates ?? []);
const currencyLabels = computed(() => labelsOf(itemTemplates.value.filter(item => item?.is_currency)));
const statusLabels = computed(() => labelsOf(preview.value?.statuses ?? []));
const statLabels = computed(() => labelsOf(preview.value?.stats ?? []));
const recipeLabels = computed(() => labelsOf(recipes.value));
const choiceLabels = computed(() => labelsOf(choiceRows.value));
const slotLabels = computed(() => labelsOf(slotRows.value));

function labelsFor(key: string): Map<string, string> | undefined {
  switch (key) {
    case 'choices': return choiceLabels.value;
    case 'slots': return slotLabels.value;
    case 'learn_recipe': return recipeLabels.value;
    case 'status': return statusLabels.value;
    default: return undefined;
  }
}

function traitLabelsFor(key: string): Map<string, string> | undefined {
  const file = traitDefs.value.get(key)?.fromFile;
  return file ? fromFileLabels.value.get(file) : undefined;
}

const traitUsage = computed(() => {
  const counts = new Map<string, number>();
  for (const item of itemTemplates.value) for (const key in item?.traits ?? {}) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
});

// ── Editing ──
function setRoot(key: string, value: any) {
  if (isEmptyValue(value) || value === false) delete localItem.value[key];
  else localItem.value[key] = value;
  changed();
}

function setId(value: string | undefined) {
  setRoot('id', value);
}

function setNested(key: 'traits' | 'actions', field: string, value: any) {
  if (!localItem.value[key] || typeof localItem.value[key] !== 'object') localItem.value[key] = {};
  localItem.value[key][field] = value === undefined ? null : value;
  changed();
}

function removeNested(key: 'traits' | 'actions', field: string) {
  if (!localItem.value[key]) return;
  delete localItem.value[key][field];
  if (!Object.keys(localItem.value[key]).length) delete localItem.value[key];
  changed();
}

function toggleCategory(id: string) {
  setRoot('category', localItem.value.category === id ? null : id);
}

const unknownCategory = computed(() => {
  const id = localItem.value?.category;
  return id && !categories.value.some(category => category.id === id) ? id : null;
});

// Consume statuses: rows of { status, stacks }.
const consumeRows = computed<any[]>(() => Array.isArray(localItem.value?.apply_statuses_on_consume) ? localItem.value.apply_statuses_on_consume : []);
const consumeStatusField = computed<Schemable | undefined>(() => schemaAny.value.apply_statuses_on_consume?.objects?.status);

function addConsumeRow() {
  if (!Array.isArray(localItem.value.apply_statuses_on_consume)) localItem.value.apply_statuses_on_consume = [];
  localItem.value.apply_statuses_on_consume.push({ uid: editor.createUid(), status: null });
  changed();
}

function setConsumeRow(row: any, key: 'status' | 'stacks', value: any) {
  if (isEmptyValue(value)) delete row[key]; else row[key] = value;
  changed();
}

function removeConsumeRow(index: number) {
  consumeRows.value.splice(index, 1);
  if (!consumeRows.value.length) delete localItem.value.apply_statuses_on_consume;
  changed();
}

// ── Derived ──
const info = computed(() => itemInfo(localItem.value));
const consumable = computed(() => isConsumable(localItem.value));
const equipParts = computed(() => equipSummary(localItem.value?.status));
const categoryIds = computed(() => new Set(categories.value.map(category => category.id)));
const lint = computed<ItemLint[]>(() => ready.value ? lintItem(localItem.value, fields.value, categoryIds.value) : []);

const usageSources = computed(() => preview.value ? {
  inventories: inventories.value,
  recipes: recipes.value,
  characterTemplates: preview.value.characterTemplates,
  itemTemplates: itemTemplates.value,
} : null);
const usedBy = computed<ItemUsage[]>(() => findItemUsage(localItem.value?.id, usageSources.value));

const USE_LIMIT = 12;
const showAllUses = ref(false);
const shownUses = computed(() => showAllUses.value ? usedBy.value : usedBy.value.slice(0, USE_LIMIT));

function jumpTo(use: ItemUsage) {
  const mainTab = mainTabOf(use.subTab);
  if (mainTab) emit('request-save-jump', { mainTab, subTab: use.subTab, entityId: use.id });
}

// ── Live card ──
const previewItem = shallowRef<Item | null>(null);
const previewKey = ref(0);
const previewError = ref('');

// Persistent traits (name, image, description, rarity by default) are read from the template map,
// not the item, so the unsaved copy goes into the editor-only map under its id. The next popup
// open rehydrates the map from the saved files.
function refreshPreview() {
  if (!ready.value || !localItem.value) return;
  try {
    const template = JSON.parse(JSON.stringify(localItem.value));
    template.id = template.id || '(unsaved)';
    Game.getInstance().itemSystem.itemTemplatesMap.set(template.id, template);
    previewItem.value = createPreviewItemFrom(template);
    previewError.value = '';
  } catch (e) {
    previewItem.value = null;
    previewError.value = `The card cannot render this yet: ${e}`;
  }
  previewKey.value++;
}

watchDebounced(localItem, refreshPreview, { deep: true, debounce: 150 });

const tagSuggestions = computed(() => {
  const tags = new Set<string>();
  for (const item of itemTemplates.value) for (const tag of item?.tags ?? []) tags.add(tag);
  return [...tags].sort();
});

// Scripts have no definitions, layout or usage counts: a plain panel of textareas.
const NO_DEFS = new Map<string, any>();
const NO_LAYOUT = emptyLayout();
const NO_USAGE = new Map<string, number>();
const noLabels = () => undefined;

const sectionsOpen = ref({ trade: true, equip: true, consume: true, scripts: !!Object.keys(props.item?.actions ?? {}).length });
const idInputId = `it-id-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <div class="item-editor">
    <div v-if="loadError" class="it-message error">Failed to load item data: {{ loadError }}</div>
    <div v-else-if="!ready" class="it-message">Loading item data…</div>

    <template v-else>
      <div class="it-identity">
        <FloatLabel variant="on" class="it-id" v-tooltip.top="schemaAny.id?.tooltip">
          <InputText :id="idInputId" :modelValue="localItem.id ?? ''" size="small"
            @update:modelValue="(v: string | undefined) => setId(v)" />
          <label :for="idInputId">id</label>
        </FloatLabel>
        <div class="it-categories" v-tooltip.top="'Category: the inventory tab the item sits under. Click again to clear.'">
          <button v-for="category in categories" :key="category.id" type="button" class="it-category"
            :class="{ on: localItem.category === category.id }" @click="toggleCategory(category.id)">
            <img v-if="category.icon" :src="category.icon" alt="" />{{ category.name || category.id }}
          </button>
          <span v-if="unknownCategory" class="it-category on missing">{{ unknownCategory }} (missing)</span>
        </div>
        <div class="it-tags" v-tooltip.top="schemaAny.tags?.tooltip">
          <TagChipsInput :modelValue="localItem.tags" :suggestions="tagSuggestions" placeholder="tags"
            @update:modelValue="(v: string[]) => setRoot('tags', v)" />
        </div>
      </div>

      <div class="it-body">
        <main class="it-form">
          <div v-if="lint.length" class="it-lint">
            <div v-for="(item, i) in lint" :key="i" class="it-lint-line" :class="item.level">
              <span class="pi" :class="item.level === 'warn' ? 'pi-exclamation-triangle' : 'pi-info-circle'" />
              {{ item.text }}
            </div>
          </div>

          <section class="it-section">
            <div class="it-section-head static">Traits</div>
            <FieldGroupsPanel :values="localItem.traits" :fields="traitFields" :defs-by-id="traitDefs"
              :layout="traitLayout" :labels-for="traitLabelsFor" :usage="traitUsage" :show-pinned="true"
              add-label="+ Add trait" @set="(key: string, v: any) => setNested('traits', key, v)"
              @remove="(key: string) => removeNested('traits', key)" />
          </section>

          <section class="it-section">
            <button type="button" class="it-section-head" @click="sectionsOpen.trade = !sectionsOpen.trade">
              <span class="pi" :class="sectionsOpen.trade ? 'pi-chevron-down' : 'pi-chevron-right'" />Trade and use
            </button>
            <div v-show="sectionsOpen.trade" class="it-grid">
              <div v-if="fields.price" class="it-cell wide">
                <NumberMapInput :field="fields.price" :modelValue="localItem.price" label="price"
                  :labels="currencyLabels" @update:modelValue="(v: any) => setRoot('price', v)" />
                <span v-if="!Object.keys(fields.price.objects ?? {}).length" class="it-hint">No item is marked as currency
                  yet, so nothing can price it.</span>
              </div>
              <div v-if="fields.is_currency" class="it-cell">
                <FieldValueInput :field="fields.is_currency" field-key="is_currency" :modelValue="localItem.is_currency"
                  @update:modelValue="(v: any) => setRoot('is_currency', v)" label="is_currency" />
              </div>
              <div v-if="fields.learn_recipe" class="it-cell">
                <FieldValueInput :field="fields.learn_recipe" field-key="learn_recipe" :modelValue="localItem.learn_recipe"
                  @update:modelValue="(v: any) => setRoot('learn_recipe', v)" label="learn_recipe"
                  :labels="labelsFor('learn_recipe')" />
              </div>
              <div v-if="fields.choices" class="it-cell wide">
                <FieldValueInput :field="fields.choices" field-key="choices" :modelValue="localItem.choices"
                  @update:modelValue="(v: any) => setRoot('choices', v)" label="choices" :labels="labelsFor('choices')" />
              </div>
            </div>
          </section>

          <section class="it-section">
            <button type="button" class="it-section-head" @click="sectionsOpen.equip = !sectionsOpen.equip">
              <span class="pi" :class="sectionsOpen.equip ? 'pi-chevron-down' : 'pi-chevron-right'" />Equip
            </button>
            <div v-show="sectionsOpen.equip" class="it-grid">
              <div v-if="fields.slots" class="it-cell wide">
                <FieldValueInput :field="fields.slots" field-key="slots" :modelValue="localItem.slots"
                  @update:modelValue="(v: any) => setRoot('slots', v)" label="slots" :labels="labelsFor('slots')" />
              </div>
              <div class="it-cell wide it-equip">
                <span class="it-equip-title">Equip status</span>
                <span v-if="equipParts.length" class="it-equip-text">{{ equipParts.join(' · ') }}</span>
                <span v-else class="it-hint">None. Wearing it changes nothing.</span>
                <span class="it-hint">Its stats, abilities and look are edited in the Stats, Abilities and Art Manager popups
                  above.</span>
              </div>
            </div>
          </section>

          <section class="it-section">
            <button type="button" class="it-section-head" @click="sectionsOpen.consume = !sectionsOpen.consume">
              <span class="pi" :class="sectionsOpen.consume ? 'pi-chevron-down' : 'pi-chevron-right'" />Consume
              <span v-if="consumable" class="it-badge consumable">consumable</span>
            </button>
            <div v-show="sectionsOpen.consume" class="it-grid">
              <div class="it-cell wide it-consume">
                <span class="it-sub">Statuses applied</span>
                <div v-for="(row, index) in consumeRows" :key="row.uid ?? index" class="it-consume-row">
                  <div class="it-consume-status">
                    <FieldValueInput v-if="consumeStatusField" :field="consumeStatusField" field-key="status"
                      :modelValue="row.status" @update:modelValue="(v: any) => setConsumeRow(row, 'status', v)"
                      placeholder="status" :labels="statusLabels" />
                  </div>
                  <InputNumber :modelValue="row.stacks ?? null" placeholder="stacks 1" :min="1" :useGrouping="false"
                    size="small" inputClass="it-stacks" @update:modelValue="(v: number | null) => setConsumeRow(row, 'stacks', v)"
                    @input="(e: any) => typeof e.value === 'number' && setConsumeRow(row, 'stacks', e.value)" />
                  <Button icon="pi pi-times" text rounded size="small" severity="danger" v-tooltip.top="'Remove'"
                    @click="removeConsumeRow(index)" />
                </div>
                <Button label="Add status" icon="pi pi-plus" size="small" text class="it-add" @click="addConsumeRow" />
              </div>
              <div v-if="fields.consume_percentage" class="it-cell">
                <NumberMapInput :field="fields.consume_percentage" :modelValue="localItem.consume_percentage"
                  label="consume_percentage (% of max)" :labels="statLabels"
                  @update:modelValue="(v: any) => setRoot('consume_percentage', v)" />
              </div>
              <div v-if="fields.consume_absolute" class="it-cell">
                <NumberMapInput :field="fields.consume_absolute" :modelValue="localItem.consume_absolute"
                  label="consume_absolute (flat)" :labels="statLabels"
                  @update:modelValue="(v: any) => setRoot('consume_absolute', v)" />
              </div>
            </div>
          </section>

          <section v-if="Object.keys(actionFields).length" class="it-section">
            <button type="button" class="it-section-head" @click="sectionsOpen.scripts = !sectionsOpen.scripts">
              <span class="pi" :class="sectionsOpen.scripts ? 'pi-chevron-down' : 'pi-chevron-right'" />Scripts
              <span class="it-count">{{ Object.keys(localItem.actions ?? {}).length }}</span>
            </button>
            <FieldGroupsPanel v-show="sectionsOpen.scripts" :values="localItem.actions" :fields="actionFields"
              :defs-by-id="NO_DEFS" :layout="NO_LAYOUT" :labels-for="noLabels" :usage="NO_USAGE"
              :show-pinned="false" add-label="+ Add script" @set="(key: string, v: any) => setNested('actions', key, v)"
              @remove="(key: string) => removeNested('actions', key)" />
          </section>
        </main>

        <aside class="it-side">
          <div class="it-card editor-game-preview">
            <div v-if="previewError" class="it-card-error">{{ previewError }}</div>
            <ItemCard v-else-if="previewItem" :key="previewKey" :item="previewItem" />
          </div>

          <div class="it-side-block it-slot">
            <ItemTile :info="info" :item-id="localItem.id || '?'" size="lg"
              :quantity="info.maxStack > 1 ? info.maxStack : undefined" />
            <div class="it-facts">
              <span>{{ stackLabel(info.maxStack) }}</span>
              <span v-if="info.weight">weight {{ info.weight }}</span>
              <span class="it-badges">
                <span v-if="localItem.slots?.length" class="it-badge equip">equippable</span>
                <span v-if="consumable" class="it-badge consumable">consumable</span>
                <span v-if="localItem.is_currency" class="it-badge currency">currency</span>
                <span v-if="info.rarity" class="it-badge" :class="`rarity_${info.rarity}`">{{ info.rarity }}</span>
              </span>
            </div>
          </div>

          <div class="it-side-block">
            <h4>Used by <span class="it-count">{{ usedBy.length }}</span></h4>
            <p v-if="!usedBy.length" class="it-hint">No inventory, recipe, character or price uses this item.</p>
            <div v-for="use in shownUses" :key="`${use.subTab}-${use.id}`" class="it-use-row">
              <span class="it-use-kind">{{ use.kind }}</span>
              <span class="it-use-label">{{ use.label }}</span>
              <span class="it-use-detail">{{ use.detail }}</span>
              <Button icon="pi pi-external-link" text rounded size="small" :disabled="!jumpable.get(use.subTab)?.has(use.id)"
                v-tooltip.top="'Save, then open it in its tab'" @click="jumpTo(use)" />
            </div>
            <Button v-if="usedBy.length > USE_LIMIT" :label="showAllUses ? 'Show fewer' : `Show all ${usedBy.length}`"
              text size="small" class="it-add" @click="showAllUses = !showAllUses" />
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.item-editor {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  height: 100%;
  min-height: 0;
}

.it-message {
  padding: 2rem;
  text-align: center;
  color: var(--editor-text-muted);
}

.it-message.error {
  color: var(--editor-fg-danger);
}

.it-identity {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem 0.8rem;
  padding: 0.55rem 0.7rem;
  background: var(--editor-surface-sunken);
  border: 1px solid var(--editor-border);
  border-radius: 6px;
}

.it-id {
  width: 16rem;
}

.it-id :deep(input) {
  width: 100%;
  font-family: var(--font-family-mono);
}

.it-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.it-category {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font: inherit;
  font-size: 0.8rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  border: 1px dashed var(--editor-border-strong);
  background: transparent;
  color: var(--editor-text-muted);
  cursor: pointer;
}

/* Category icons are drawn for the game's dark UI (light glyphs), so each sits on a dark badge. */
.it-category img {
  width: 20px;
  height: 20px;
  padding: 2px;
  box-sizing: border-box;
  object-fit: contain;
  border-radius: 4px;
  background: #23262e;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.it-category.on {
  border-style: solid;
  border-color: var(--editor-accent);
  color: var(--editor-accent);
  background: var(--editor-surface-selected);
}

.it-category.missing {
  border-color: var(--editor-fg-danger);
  color: var(--editor-fg-danger);
}

.it-tags {
  flex: 1 1 14rem;
  min-width: 12rem;
}

.it-body {
  display: flex;
  gap: 0.9rem;
  flex: 1;
  min-height: 0;
}

.it-form {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding-right: 0.3rem;
}

.it-form :deep(.htmlarea-resizable) {
  height: 150px;
  min-height: 110px;
}

.it-side {
  flex: 0 0 390px;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  overflow-y: auto;
  min-height: 0;
}

.it-lint {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.45rem 0.7rem;
  background: var(--editor-tint-warning);
  border-left: 4px solid var(--editor-ink-orange);
  border-radius: 4px;
}

.it-lint-line {
  font-size: 0.83rem;
  color: var(--editor-text);
}

.it-lint-line .pi {
  font-size: 0.78rem;
  margin-right: 0.3rem;
}

.it-lint-line.warn .pi {
  color: var(--editor-fg-warning);
}

.it-lint-line.info .pi {
  color: var(--editor-fg-info);
}

.it-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.it-section-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: none;
  border: none;
  padding: 0 0 0.3rem;
  border-bottom: 1px solid var(--editor-border);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--editor-text-muted);
  cursor: pointer;
  text-align: left;
}

.it-section-head.static {
  cursor: default;
}

.it-section-head .pi {
  font-size: 0.7rem;
}

.it-count {
  font-weight: normal;
  font-size: 0.75rem;
  color: var(--editor-text-muted);
  text-transform: none;
}

.it-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem 0.9rem;
}

.it-cell {
  min-width: 0;
}

.it-cell.wide {
  grid-column: 1 / -1;
}

.it-hint {
  display: block;
  font-size: 0.78rem;
  color: var(--editor-text-muted);
  font-style: italic;
}

.it-equip {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.45rem 0.6rem;
  border-radius: 4px;
  background: var(--editor-surface-sunken);
}

.it-equip-title,
.it-sub {
  font-size: 0.75rem;
  color: var(--editor-text-muted);
}

.it-equip-text {
  font-size: 0.85rem;
  color: var(--editor-text);
}

.it-consume {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.it-consume-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.it-consume-status {
  min-width: 14rem;
}

.it-consume-row :deep(.it-stacks) {
  width: 6rem;
}

.it-add {
  align-self: flex-start;
}

.it-badge {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--editor-surface-hover);
  color: var(--rarity-color, var(--editor-text));
}

.it-badge.consumable {
  background: var(--editor-tint-success);
  color: var(--editor-fg-success);
}

.it-badge.equip {
  background: var(--editor-tint-info);
  color: var(--editor-fg-info);
}

.it-badge.currency {
  background: var(--editor-tint-warning);
  color: var(--editor-fg-warning);
}

.it-card {
  background: #16181d;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  justify-content: center;
}

.it-card :deep(.item-card) {
  max-width: 100%;
}

.it-card :deep(.lore-link[data-lore-kind='item']) {
  pointer-events: none;
}

.it-card-error {
  color: #ef9a9a;
  font-size: 0.85rem;
}

.it-side-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.55rem 0.7rem;
  background: var(--editor-surface-raised);
  border: 1px solid var(--editor-border);
  border-radius: 6px;
}

.it-side-block h4 {
  margin: 0;
  font-size: 0.88rem;
  color: var(--editor-text);
}

.it-slot {
  flex-direction: row;
  align-items: center;
  gap: 0.8rem;
}

.it-facts {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.8rem;
  color: var(--editor-text);
}

.it-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.it-use-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.1rem 0.45rem;
  font-size: 0.8rem;
  min-height: 1.8rem;
}

.it-use-kind {
  flex: 0 0 5rem;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--editor-text-muted);
}

.it-use-label {
  flex: 1 1 9rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--editor-text);
}

.it-use-detail {
  color: var(--editor-text-muted);
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .it-body {
    flex-direction: column;
    overflow-y: auto;
  }

  .it-form,
  .it-side {
    overflow: visible;
    flex: 0 0 auto;
  }
}
</style>
