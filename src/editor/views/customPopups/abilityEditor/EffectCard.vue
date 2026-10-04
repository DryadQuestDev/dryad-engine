<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import FloatLabel from 'primevue/floatlabel';
import ToggleSwitch from 'primevue/toggleswitch';
import FormFieldRenderer from '../../dform/FormFieldRenderer.vue';
import FieldValueInput from '../../shared/fields/FieldValueInput.vue';
import { hintDefault } from '../../../editorLayouts';
import {
  companionLabel, displayValue, isEmptyValue, parseTemplate, plainText,
  type AspectContext, type TemplatePart,
} from './abilityEditorModel';

/**
 * One effect of an ability template. Each aspect in use is a sentence row built from its
 * in-game description template, with inputs where the template prints values and inline slots
 * for the companion aspects it references. Aspects without a template get a labelled row.
 */
const props = defineProps<{
  effect: any;
  /** Position in the card order, 0-based, and how many effects there are. */
  position: number;
  count: number;
  ctx: AspectContext;
  /** Modifier effects: 'merge' reuses a base effect id (values add to it), 'new' adds a group. */
  mergeMode?: 'merge' | 'new' | null;
  baseAspects?: Record<string, any> | null;
  baseLines?: string[];
  duplicateId?: boolean;
}>();

const emit = defineEmits<{
  changed: [];
  remove: [];
  duplicate: [];
  move: [delta: number];
  split: [key: string];
}>();

const root = ref<HTMLElement | null>(null);
const collapsed = ref(false);
const attachOpen = ref(!!plainText(props.effect?.description_attach));

const aspects = computed<Record<string, any>>(() => props.effect?.aspects ?? {});

function ensureAspects(): Record<string, any> {
  if (!props.effect.aspects || typeof props.effect.aspects !== 'object') props.effect.aspects = {};
  return props.effect.aspects;
}

// ── Rows ──

interface Row {
  key: string;
  parts: TemplatePart[];
  /** The template prints the aspect's own value; false for flag lines like "Cleanse". */
  hasSelf: boolean;
  color: string | null;
  badge: { text: string; tone: 'muted' | 'danger' } | null;
  known: boolean;
  isBoolean: boolean;
}

function colorOf(key: string): string | null {
  const groupId = props.ctx.layout.groupOf.get(key);
  return groupId ? props.ctx.layout.groups.find(group => group.id === groupId)?.color ?? null : null;
}

const rows = computed<Row[]>(() => {
  const keys = Object.keys(aspects.value);
  const defs = props.ctx.defsById;
  // Companions of an owner in this effect render inside the owner's row.
  const inline = new Set<string>();
  for (const key of keys) {
    if (!defs.get(key)?.ingame_description) continue;
    for (const companion of props.ctx.companions.companionsOf.get(key) ?? []) inline.add(companion);
  }
  return keys
    .filter(key => !inline.has(key))
    .map((key, index) => ({ key, index }))
    .sort((a, b) => (defs.get(a.key)?.order ?? 0) - (defs.get(b.key)?.order ?? 0) || a.index - b.index)
    .map(({ key }) => {
      const def = defs.get(key);
      const field = props.ctx.fields[key];
      const parts = def?.ingame_description && !def.ingame_hide ? parseTemplate(def.ingame_description) : [];
      let badge: Row['badge'] = null;
      if (!field || !def) badge = { text: 'no definition', tone: 'danger' };
      else if (def.debug_info) badge = { text: 'dev readout', tone: 'muted' };
      else if (def.ingame_hide) badge = { text: 'hidden on card', tone: 'muted' };
      else if (!def.ingame_description && !props.ctx.companions.ownersOf.has(key)) badge = { text: 'not on card', tone: 'muted' };
      return {
        key,
        parts,
        hasSelf: parts.some(part => part.kind === 'self'),
        color: colorOf(key),
        badge,
        known: !!field,
        isBoolean: field?.type === 'boolean',
      };
    });
});

function siblingParts(id: string): TemplatePart[] {
  return parseTemplate(props.ctx.defsById.get(id)?.ingame_description);
}

function siblingText(id: string): string {
  return siblingParts(id).filter(part => part.kind === 'text').map(part => (part as { text: string }).text).join('').trim();
}

function companionsOf(key: string): string[] {
  return (props.ctx.companions.companionsOf.get(key) ?? []).filter(id => props.ctx.fields[id]);
}

// Base values a merging modifier effect adds onto, for the keys of one row.
function baseNote(row: Row): string {
  const base = props.baseAspects;
  if (!base) return '';
  const notes: string[] = [];
  for (const key of [row.key, ...companionsOf(row.key)]) {
    if (isEmptyValue(base[key])) continue;
    const name = key === row.key ? '' : `${companionLabel(key, row.key)} `;
    notes.push(`${name}${displayValue(base[key])}`);
  }
  return notes.length ? `base: ${notes.join(', ')}` : '';
}

// ── Editing ──

function changed() {
  emit('changed');
}

/** A row's own value keeps its key when cleared, so the row stays while it is retyped. */
function setOwn(key: string, value: any) {
  ensureAspects()[key] = value === undefined ? null : value;
  changed();
}

/** Companions are optional: clearing one removes it, like the card collapses an absent value. */
function setCompanion(key: string, value: any) {
  const target = ensureAspects();
  if (isEmptyValue(value) || value === false) delete target[key];
  else target[key] = value;
  changed();
}

function toggleCompanion(key: string) {
  setCompanion(key, aspects.value[key] === true ? false : true);
}

function removeRow(key: string) {
  const target = ensureAspects();
  delete target[key];
  for (const companion of companionsOf(key)) delete target[companion];
  changed();
}

function typeDefault(key: string): any {
  const field = props.ctx.fields[key];
  const parsed = hintDefault(props.ctx.layout.hints.get(key), field);
  if (parsed.found) return parsed.value;
  switch (field?.type) {
    case 'number': return 0;
    case 'boolean': return true;
    case 'chooseMany': return [];
    default: return null;
  }
}

function addAspect(key: string | null) {
  if (!key) return;
  ensureAspects()[key] = typeDefault(key);
  changed();
  collapsed.value = false;
  nextTick(() => {
    const input = root.value?.querySelector<HTMLElement>(`[data-row="${key}"] input, [data-row="${key}"] .p-select, [data-row="${key}"] .p-multiselect`);
    input?.focus();
    if (input instanceof HTMLInputElement) input.select();
  });
}

const paletteOptions = computed(() => {
  const source = props.mergeMode === 'merge' ? props.ctx.paletteAll : props.ctx.palette;
  const set = new Set(Object.keys(aspects.value));
  return source
    .map(group => ({ label: group.label, items: group.items.filter(item => !set.has(item.value)) }))
    .filter(group => group.items.length);
});

function setEffectField(key: 'id' | 'name', value: string) {
  if (!value) delete props.effect[key];
  else props.effect[key] = value;
  changed();
}

function setAttach(value: any) {
  if (isEmptyValue(value) || !plainText(value)) delete props.effect.description_attach;
  else props.effect.description_attach = value;
  changed();
}

const attachField = computed(() => props.ctx.effectFields.description_attach);
const idInputId = `ec-id-${Math.random().toString(36).slice(2, 8)}`;
const nameInputId = `ec-name-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <div ref="root" class="effect-card" :class="{ collapsed, merge: mergeMode === 'merge', added: mergeMode === 'new' }">
    <div class="ec-head">
      <div class="ec-move">
        <Button icon="pi pi-angle-up" text rounded size="small" severity="secondary" :disabled="position === 0"
          v-tooltip.top="'Earlier in the card and in combat'" @click="emit('move', -1)" />
        <Button icon="pi pi-angle-down" text rounded size="small" severity="secondary" :disabled="position >= count - 1"
          v-tooltip.top="'Later in the card and in combat'" @click="emit('move', 1)" />
      </div>
      <FloatLabel variant="on" class="ec-id">
        <InputText :id="idInputId" :modelValue="effect.id ?? ''" size="small" :invalid="duplicateId"
          @update:modelValue="(v: string | undefined) => setEffectField('id', v ?? '')" />
        <label :for="idInputId">effect id</label>
      </FloatLabel>
      <FloatLabel variant="on" class="ec-name">
        <InputText :id="nameInputId" :modelValue="effect.name ?? ''" size="small"
          @update:modelValue="(v: string | undefined) => setEffectField('name', v ?? '')" />
        <label :for="nameInputId">group title</label>
      </FloatLabel>
      <span v-if="mergeMode === 'merge'" class="ec-badge merge"
        v-tooltip.top="'Same id as a base effect: numbers add to it, lists join it, the rest replaces.'">adds to base
        effect</span>
      <span v-else-if="mergeMode === 'new'" class="ec-badge added"
        v-tooltip.top="'An id the base ability does not have: the card shows it as its own group.'">new group</span>
      <span class="ec-spacer" />
      <Button icon="pi pi-align-left" text rounded size="small" :severity="attachOpen ? 'info' : 'secondary'"
        v-tooltip.top="'Attached text: prose printed above the generated lines'" @click="attachOpen = !attachOpen" />
      <Button icon="pi pi-copy" text rounded size="small" severity="secondary" v-tooltip.top="'Duplicate effect'"
        @click="emit('duplicate')" />
      <Button icon="pi pi-trash" text rounded size="small" severity="danger" v-tooltip.top="'Remove effect'"
        @click="emit('remove')" />
      <Button :icon="collapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'" text rounded size="small"
        severity="secondary" @click="collapsed = !collapsed" />
    </div>

    <div v-show="!collapsed" class="ec-body">
      <div v-if="baseLines?.length" class="ec-base">
        <span class="ec-base-title">Base effect</span>
        <span v-for="(line, i) in baseLines" :key="i" class="ec-base-line">{{ line }}</span>
      </div>

      <div v-if="attachOpen && attachField" class="ec-attach">
        <FormFieldRenderer :base-field-schema="attachField" field-key="description_attach" :item-data="effect"
          :root-schema="ctx.effectFields" :field-id="`${idInputId}-attach`" :modelValue="effect.description_attach"
          @update:modelValue="setAttach" :form-data="effect" :force-active="true" />
      </div>

      <div v-for="row in rows" :key="row.key" class="ec-row" v-bind="{ 'data-row': row.key }"
        :style="row.color ? { '--row-color': row.color } : undefined" :class="{ unknown: !row.known }">
        <span class="ec-sentence">
          <template v-if="row.parts.length">
            <ToggleSwitch v-if="row.isBoolean && !row.hasSelf" :modelValue="aspects[row.key] === true"
              @update:modelValue="(v: boolean) => setOwn(row.key, v)" class="ec-flag" />
            <template v-for="(part, pi) in row.parts" :key="pi">
              <span v-if="part.kind === 'text'" class="st-text">{{ part.text }}</span>
              <FieldValueInput v-else-if="part.kind === 'self'" :field="ctx.fields[row.key]" :field-key="row.key"
                :modelValue="aspects[row.key]" @update:modelValue="(v: any) => setOwn(row.key, v)"
                :hint="ctx.layout.hints.get(row.key)" :labels="ctx.labelsFor(row.key)" :placeholder="row.key"
                :holder="aspects" :holder-schema="ctx.fields" />
              <template v-else-if="ctx.fields[part.id]">
                <button v-if="ctx.fields[part.id].type === 'boolean'" type="button" class="st-chip"
                  :class="{ on: aspects[part.id] === true }" v-tooltip.top="part.id" @click="toggleCompanion(part.id)">
                  {{ siblingText(part.id) || companionLabel(part.id, row.key) }}
                </button>
                <span v-else-if="siblingParts(part.id).some(sp => sp.kind === 'self')" class="st-companion"
                  :class="{ empty: aspects[part.id] === undefined }">
                  <template v-for="(sp, si) in siblingParts(part.id)" :key="si">
                    <span v-if="sp.kind === 'text'" class="st-text">{{ sp.text }}</span>
                    <FieldValueInput v-else-if="sp.kind === 'self'" :field="ctx.fields[part.id]" :field-key="part.id"
                      :modelValue="aspects[part.id]" @update:modelValue="(v: any) => setCompanion(part.id, v)"
                      :hint="ctx.layout.hints.get(part.id)" :labels="ctx.labelsFor(part.id)"
                      :placeholder="companionLabel(part.id, row.key)" :holder="aspects" :holder-schema="ctx.fields" />
                  </template>
                </span>
                <FieldValueInput v-else :field="ctx.fields[part.id]" :field-key="part.id" :modelValue="aspects[part.id]"
                  @update:modelValue="(v: any) => setCompanion(part.id, v)" :hint="ctx.layout.hints.get(part.id)"
                  :labels="ctx.labelsFor(part.id)" :placeholder="companionLabel(part.id, row.key)" :holder="aspects"
                  :holder-schema="ctx.fields" />
              </template>
              <span v-else class="st-text st-missing">[{{ part.id }}]</span>
            </template>
            <FieldValueInput v-if="!row.hasSelf && !row.isBoolean" :field="ctx.fields[row.key]" :field-key="row.key"
              :modelValue="aspects[row.key]" @update:modelValue="(v: any) => setOwn(row.key, v)"
              :hint="ctx.layout.hints.get(row.key)" :labels="ctx.labelsFor(row.key)" :placeholder="row.key"
              :holder="aspects" :holder-schema="ctx.fields" />
          </template>

          <template v-else>
            <span class="st-label">{{ row.key }}</span>
            <FieldValueInput v-if="row.known" :field="ctx.fields[row.key]" :field-key="row.key" :modelValue="aspects[row.key]"
              @update:modelValue="(v: any) => setOwn(row.key, v)" :hint="ctx.layout.hints.get(row.key)"
              :labels="ctx.labelsFor(row.key)" :placeholder="row.key" :holder="aspects" :holder-schema="ctx.fields" />
            <code v-else class="st-raw">{{ displayValue(aspects[row.key]) }}</code>
          </template>
        </span>

        <span v-if="row.badge" class="ec-row-badge" :class="row.badge.tone">{{ row.badge.text }}</span>
        <span v-if="baseNote(row)" class="ec-base-note">{{ baseNote(row) }}</span>
        <span class="ec-row-actions">
          <Button icon="pi pi-arrow-down-left" text rounded size="small" severity="secondary"
            v-tooltip.top="'Move to a new effect'" @click="emit('split', row.key)" />
          <Button icon="pi pi-times" text rounded size="small" severity="danger" v-tooltip.top="'Remove aspect'"
            @click="removeRow(row.key)" />
        </span>
      </div>

      <div v-if="!rows.length" class="ec-empty">No aspects yet.</div>

      <Select :modelValue="null" @update:modelValue="addAspect" :options="paletteOptions" optionLabel="label"
        optionValue="value" optionGroupLabel="label" optionGroupChildren="items" :filterFields="['label', 'desc']"
        filter placeholder="+ Add aspect" size="small" appendTo="body" class="ec-add"
        :disabled="!paletteOptions.length">
        <template #option="{ option }">
          <div class="pal-option">
            <code>{{ option.label }}</code>
            <span v-if="option.desc" class="pal-desc">{{ option.desc }}</span>
          </div>
        </template>
      </Select>
    </div>
  </div>
</template>

<style scoped>
.effect-card {
  border: 1px solid var(--editor-border);
  border-radius: 6px;
  background: var(--editor-surface);
}

.effect-card.merge {
  border-left: 3px solid var(--editor-ink-blue);
}

.effect-card.added {
  border-left: 3px solid var(--editor-ink-green);
}

.ec-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.5rem;
  background: var(--editor-surface-raised);
  border-bottom: 1px solid var(--editor-border);
  border-radius: 6px 6px 0 0;
}

.effect-card.collapsed .ec-head {
  border-bottom: none;
  border-radius: 6px;
}

.ec-move {
  display: flex;
  flex-direction: column;
}

.ec-move :deep(.p-button) {
  width: 1.5rem;
  height: 1.1rem;
}

.ec-id {
  width: 9rem;
}

.ec-name {
  width: 14rem;
}

.ec-id :deep(input),
.ec-name :deep(input) {
  width: 100%;
}

.ec-badge {
  font-size: 0.72rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  white-space: nowrap;
}

.ec-badge.merge {
  background: var(--editor-tint-info);
  color: var(--editor-fg-info);
}

.ec-badge.added {
  background: var(--editor-tint-success);
  color: var(--editor-fg-success);
}

.ec-spacer {
  flex: 1;
}

.ec-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.6rem 0.6rem;
}

.ec-base {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.6rem;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  background: var(--editor-tint-info);
  font-size: 0.8rem;
}

.ec-base-title {
  font-weight: 600;
  color: var(--editor-fg-info);
}

.ec-base-line {
  color: var(--editor-text);
}

.ec-base-line + .ec-base-line::before {
  content: '·';
  margin-right: 0.6rem;
  color: var(--editor-text-muted);
}

.ec-attach :deep(.field-container) {
  margin-bottom: 0;
}

.ec-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.3rem;
  padding: 0.2rem 0.3rem 0.2rem 0.55rem;
  border-left: 3px solid var(--row-color, var(--editor-border-strong));
  border-radius: 3px;
  background: var(--editor-surface-sunken);
}

.ec-row.unknown {
  border-left-color: var(--editor-fg-danger);
}

.ec-sentence {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  line-height: 1.9;
}

.st-text {
  color: var(--editor-text);
  font-size: 0.9rem;
  white-space: pre-wrap;
}

.st-missing {
  color: var(--editor-fg-danger);
}

.st-label {
  font-family: var(--font-family-mono);
  font-size: 0.82rem;
  color: var(--editor-text-muted);
}

.st-raw {
  font-size: 0.8rem;
}

.st-companion {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  padding: 0 0.3rem;
  border-radius: 4px;
}

.st-companion.empty .st-text {
  color: var(--editor-text-faint);
}

.st-chip {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  border: 1px dashed var(--editor-border-strong);
  background: transparent;
  color: var(--editor-text-faint);
  cursor: pointer;
}

.st-chip.on {
  border-style: solid;
  border-color: var(--editor-accent);
  color: var(--editor-accent);
  background: var(--editor-surface-selected);
}

.ec-flag {
  flex: 0 0 auto;
}

.ec-row-badge {
  font-size: 0.7rem;
  padding: 0 0.4rem;
  border-radius: 3px;
  border: 1px solid var(--editor-border-strong);
  white-space: nowrap;
}

.ec-row-badge.muted {
  color: var(--editor-text-muted);
}

.ec-row-badge.danger {
  color: var(--editor-fg-danger);
  border-color: var(--editor-fg-danger);
}

.ec-base-note {
  font-size: 0.75rem;
  color: var(--editor-fg-info);
  white-space: nowrap;
}

.ec-row-actions {
  display: inline-flex;
  opacity: 0.35;
  transition: opacity 0.15s ease;
}

.ec-row:hover .ec-row-actions,
.ec-row:focus-within .ec-row-actions {
  opacity: 1;
}

.ec-empty {
  font-size: 0.85rem;
  color: var(--editor-text-muted);
  font-style: italic;
  padding: 0.2rem 0.3rem;
}

.ec-add {
  align-self: flex-start;
  min-width: 14rem;
}

.pal-option {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  max-width: 28rem;
}

.pal-desc {
  font-size: 0.75rem;
  color: var(--editor-text-muted);
  white-space: normal;
}
</style>
