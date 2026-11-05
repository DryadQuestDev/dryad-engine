<script setup lang="ts">
import { Game } from '../../game';
import { ref, shallowRef, computed, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import Select from 'primevue/select';
import { panelOverlayClass } from '../../../editor/editorTheme';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import type { Character } from '../../core/character/character';
import { debugSerialize } from '../../../utility/debug-serializer';
import { Global } from '../../../global/global';
import CharacterFace from '../CharacterFace.vue';
import CharacterViewerPopup from '../progression/CharacterViewerPopup.vue';
import DebugChangesBox from './DebugChangesBox.vue';
import DebugEditField, { type EditFieldEditor } from './DebugEditField.vue';
import DebugPicker, { type PickerOption } from './DebugPicker.vue';
import {
  devChanges, devSet, devStatus, findDevChange, isInEffect, loadDevChanges, undoDevChanges,
  type DevChange, type DevValue,
} from '../../utils/devChanges';

const game = Game.getInstance();

loadDevChanges();

const selectedTemplate = ref<string | null>(null);
const newCharacterId = ref<string>('');

type SortKey = 'id' | 'name' | 'template';
type TagMode = 'or' | 'and';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Sort: ID', value: 'id' },
  { label: 'Sort: Name', value: 'name' },
  { label: 'Sort: Template', value: 'template' },
];

// mergeDefaults so a stored blob from an older build still picks up filters added later
const filters = useStorage('debug-characters-filters', {
  search: '',
  hasAbilities: false,
  inPartyOnly: false,
  collapseTemplates: false,
  tags: [] as string[],
  tagMode: 'or' as TagMode,
  sort: 'id' as SortKey,
}, localStorage, { mergeDefaults: true });

const characters = computed<Character[]>(() => {
  return Array.from(game.characterSystem.characters.value.values());
});

const allTags = computed<string[]>(() => {
  const tags = new Set<string>();
  for (const character of characters.value) {
    for (const tag of character.tags || []) tags.add(tag);
  }
  return Array.from(tags).sort();
});

function characterName(character: Character): string {
  return character.getTrait('name') || '';
}

function hasAbilities(character: Character): boolean {
  return Object.keys(character.getAbilities()).length > 0;
}

function matchesTags(character: Character, selected: string[]): boolean {
  const tags = character.tags || [];
  return filters.value.tagMode === 'and'
    ? selected.every(tag => tags.includes(tag))
    : selected.some(tag => tags.includes(tag));
}

function toggleTag(tag: string) {
  const tags = filters.value.tags;
  const at = tags.indexOf(tag);
  if (at === -1) tags.push(tag);
  else tags.splice(at, 1);
}

const matchedCharacters = computed<Character[]>(() => {
  const query = filters.value.search.trim().toLowerCase();
  const tagFilter = filters.value.tags;
  const partyIds = game.characterSystem.partyIds.value;

  const list = characters.value.filter(character => {
    if (filters.value.hasAbilities && !hasAbilities(character)) return false;
    if (filters.value.inPartyOnly && !partyIds.has(character.id)) return false;
    if (tagFilter.length && !matchesTags(character, tagFilter)) return false;
    if (query) {
      const haystack = `${character.id} ${characterName(character)} ${character.templateId}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sortKey = filters.value.sort;
  return list.sort((a, b) => {
    if (sortKey === 'name') return (characterName(a) || a.id).localeCompare(characterName(b) || b.id);
    if (sortKey === 'template') {
      const byTemplate = (a.templateId || '').localeCompare(b.templateId || '');
      if (byTemplate !== 0) return byTemplate;
    }
    return a.id.localeCompare(b.id);
  });
});

// Counted before the collapse so a surviving representative can report how many it stands for.
const templateCounts = computed<Map<string, number>>(() => {
  const counts = new Map<string, number>();
  for (const character of matchedCharacters.value) {
    if (!character.templateId) continue;
    counts.set(character.templateId, (counts.get(character.templateId) ?? 0) + 1);
  }
  return counts;
});

const filteredCharacters = computed<Character[]>(() => {
  if (!filters.value.collapseTemplates) return matchedCharacters.value;

  // Collapsed after the sort, so the representative is whichever member the current sort puts
  // first — stable rather than insertion-order luck. Untemplated characters each stand alone:
  // there is no template to collapse them onto, so they all survive.
  const seen = new Set<string>();
  return matchedCharacters.value.filter(character => {
    if (!character.templateId) return true;
    if (seen.has(character.templateId)) return false;
    seen.add(character.templateId);
    return true;
  });
});

function collapsedCount(character: Character): number {
  if (!filters.value.collapseTemplates || !character.templateId) return 1;
  return templateCounts.value.get(character.templateId) ?? 1;
}

const activeFilterCount = computed(() => {
  let count = 0;
  if (filters.value.search.trim()) count++;
  if (filters.value.hasAbilities) count++;
  if (filters.value.inPartyOnly) count++;
  if (filters.value.collapseTemplates) count++;
  if (filters.value.tags.length) count++;
  return count;
});

function resetFilters() {
  filters.value.search = '';
  filters.value.hasAbilities = false;
  filters.value.inPartyOnly = false;
  filters.value.collapseTemplates = false;
  filters.value.tags = [];
}

// --- Grid pagination --------------------------------------------------------
// Faces are not cheap — each one that lacks a face_static renders a full CharacterDoll — so the
// grid pages rather than mounting the whole roster. Transient, so it stays out of the stored
// filters: a page number is a scroll position, not a preference.
const GRID_PAGE_SIZE = 24;

const page = ref(0);

const pageCount = computed(() => Math.max(1, Math.ceil(filteredCharacters.value.length / GRID_PAGE_SIZE)));

const pagedCharacters = computed<Character[]>(() => {
  const start = page.value * GRID_PAGE_SIZE;
  return filteredCharacters.value.slice(start, start + GRID_PAGE_SIZE);
});

// Narrowing the filters mid-browse would otherwise strand the view on a page that no longer
// exists, showing an empty grid with results sitting on page 1.
watch(filters, () => { page.value = 0; }, { deep: true });

// Characters can also come and go from under the grid (a debug create, a battle ending).
watch(pageCount, count => {
  if (page.value >= count) page.value = count - 1;
});

function goToPage(next: number) {
  page.value = Math.min(Math.max(next, 0), pageCount.value - 1);
}

// --- Inline debug panel -----------------------------------------------------
// Kept as an id rather than the Character itself so a recreated character with the
// same id re-resolves instead of pinning a stale instance.
const debugId = ref<string | null>(null);

const debugCharacter = computed<Character | null>(() => {
  if (!debugId.value) return null;
  return game.characterSystem.characters.value.get(debugId.value) || null;
});

function inspectCharacter(character: Character) {
  debugId.value = character.id;
}

function closeInspect() {
  debugId.value = null;
}

// --- Character viewer popup -------------------------------------------------
const viewerIndex = ref<number | null>(null);
// Snapshot of the list at open time, so a filter edit behind the popup can't re-index the
// viewer out from under the character being inspected. shallowRef, not ref: a deep ref would
// wrap every Character in a reactive proxy and break identity against the live characters map.
const viewerCharacters = shallowRef<Character[]>([]);

// Takes the character rather than a loop index: the grid iterates a page slice, so the index the
// viewer needs is the one in the whole filtered list it is handed.
function openViewer(character: Character) {
  const list = filteredCharacters.value;
  viewerCharacters.value = list;
  viewerIndex.value = Math.max(0, list.indexOf(character));
}

function closeViewer() {
  viewerIndex.value = null;
  viewerCharacters.value = [];
}

// --- Actions ----------------------------------------------------------------
function createCharacter() {
  if (selectedTemplate.value && newCharacterId.value) {
    let character = game.characterSystem.createCharacter(newCharacterId.value, selectedTemplate.value);
    if (character) {
      game.characterSystem.addCharacter(character, true);
    }
  }
}

// --- Inspect: editable fields ---------------------------------------------
// Every edit runs the action content would use (devChanges), so it behaves exactly as a line in a
// scene would, and adds up into the changes box below the fields.
type FieldKind = 'attr' | 'trait' | 'stat' | 'resource';

type FieldRow = {
  kind: FieldKind;
  key: string;
  /** The value on the character's core status, which is what the action sets. */
  value: DevValue;
  editor: EditFieldEditor;
  options?: string[];
  /** Set when a status (an equipped item, a buff) makes the character show something else. */
  note?: string;
  max?: number;
  /** Set when the game wrote this field: save restoration replays it over the template. */
  written?: { text: string; title: string };
};

const FORGET_HINT = 'Click to forget it: from the next load the field follows the template.';

function signed(n: number): string {
  return n < 0 ? String(n) : `+${n}`;
}

function shown(value: unknown): string {
  if (value === undefined || value === null) return 'nothing';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** The tag for a field the game wrote: what save restoration does with it, and what the template says. */
function writtenTag(character: Character, kind: FieldKind, key: string): FieldRow['written'] {
  const writes = character.coreWrites;
  const template = game.characterSystem.getCharacterTemplate(character.id, character.templateId) as any;
  if (kind === 'stat') {
    const pin = writes.statPins[key];
    const change = writes.stats[key];
    if (pin === undefined && change === undefined) return undefined;
    const text = [pin !== undefined ? `=${pin}` : '', change !== undefined ? signed(change) : ''].filter(Boolean).join(' ');
    const base = template?.stats?.[key];
    const restored = pin === undefined
      ? `The story added ${signed(change!)}, restored on top of the template's ${shown(base)}.`
      : `Set by the story to ${pin}${change !== undefined ? `, then ${signed(change)}` : ''}. Kept there when the template changes (it says ${shown(base)}).`;
    return { text, title: `${restored}\n${FORGET_HINT}` };
  }
  const record = kind === 'trait' ? writes.traits : kind === 'attr' ? writes.attributes : null;
  if (!record || !(key in record)) return undefined;
  const base = template?.[kind === 'trait' ? 'traits' : 'attributes']?.[key];
  return { text: 'story', title: `Set by the story. The template says ${shown(base)}.\n${FORGET_HINT}` };
}

function forgetWrite(row: FieldRow) {
  const writes = debugCharacter.value?.coreWrites;
  if (!writes) return;
  if (row.kind === 'stat') {
    delete writes.statPins[row.key];
    delete writes.stats[row.key];
  } else if (row.kind === 'trait') {
    delete writes.traits[row.key];
  } else if (row.kind === 'attr') {
    delete writes.attributes[row.key];
  }
}

type StatusRow = { id: string; name: string; image: string; stacks: number; removed: boolean };

/** Lets a long snake_case name wrap at its underscores rather than mid-word. */
function nameParts(name: string): string[] {
  return name.split(/(?<=_)/);
}

function byOrder(keys: string[], defs: Map<string, { order?: number }>): string[] {
  return keys.sort((a, b) => (defs.get(a)?.order ?? 0) - (defs.get(b)?.order ?? 0) || a.localeCompare(b));
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function statusLabel(character: Character, statusId: string): string {
  // An equipped item grants its status as "item_<uid>"; name the item instead.
  const item = statusId.startsWith('item_') ? character.getEquippedItems().find(i => `item_${i.uid}` === statusId) : null;
  return item?.getName() || character.getStatus(statusId)?.name || statusId;
}

function overrideNote(character: Character, field: 'attributes' | 'traits', key: string, coreValue: DevValue): string | undefined {
  const shown = character[field][key];
  if (sameValue(shown ?? null, coreValue)) return undefined;
  const [, ...statuses] = character.getStatuses();
  const source = [...statuses].reverse().find(status => key in (status[field] ?? {}));
  const text = typeof shown === 'object' && shown !== null ? JSON.stringify(shown) : String(shown ?? 'nothing');
  return source ? `shows ${text} · from ${statusLabel(character, source.id)}` : `shows ${text}`;
}

const attributeRows = computed<FieldRow[]>(() => {
  const character = debugCharacter.value;
  if (!character) return [];
  const core = character.getCoreStatus();
  const defs = game.characterSystem.attributesMap;
  const keys = [...new Set([...Object.keys(core.attributes), ...Object.keys(character.attributes)])].filter(k => defs.has(k));
  return byOrder(keys, defs).map(key => {
    const value = core.attributes[key] ?? null;
    const options = defs.get(key)?.values ?? [];
    return {
      kind: 'attr', key, value, editor: options.length ? 'select' : 'text', options,
      note: overrideNote(character, 'attributes', key, value),
      written: writtenTag(character, 'attr', key),
    };
  });
});

const characterStatKeys = computed<string[]>(() => {
  const character = debugCharacter.value;
  if (!character) return [];
  const core = character.getCoreStatus();
  const defs = game.characterSystem.statsMap;
  return byOrder([...defs.keys()].filter(k => k in core.stats || character.hasStat(k)), defs);
});

const statRows = computed<FieldRow[]>(() => {
  const character = debugCharacter.value;
  if (!character) return [];
  const core = character.getCoreStatus();
  return characterStatKeys.value.map(key => {
    const value = core.stats[key] ?? 0;
    const total = character.getStat(key);
    return {
      kind: 'stat', key, value, editor: 'number', note: total !== value ? `total ${total} with statuses` : undefined,
      written: writtenTag(character, 'stat', key),
    };
  });
});

const resourceRows = computed<FieldRow[]>(() => {
  const character = debugCharacter.value;
  if (!character) return [];
  return characterStatKeys.value
    .filter(key => game.characterSystem.statsMap.get(key)?.is_resource)
    .map(key => ({ kind: 'resource', key, value: character.getResource(key), editor: 'number', max: character.getStat(key) }));
});

const TEXT_TRAITS = ['string', 'textarea', 'color', 'image', 'video', 'htmlarea', 'chooseOne'];

const traitRows = computed<FieldRow[]>(() => {
  const character = debugCharacter.value;
  if (!character) return [];
  const core = character.getCoreStatus();
  const defs = game.characterSystem.traitsMap;
  const keys = [...new Set([...Object.keys(core.traits), ...Object.keys(character.traits)])].filter(k => defs.has(k));
  return byOrder(keys, defs).map(key => {
    const def = defs.get(key)!;
    const value = core.traits[key] ?? null;
    const values = def.type === 'chooseOne' ? def.values ?? [] : [];
    let editor: EditFieldEditor = def.type === 'number' || def.type === 'range' ? 'number'
      : def.type === 'boolean' ? 'boolean'
        : values.length ? 'select'
          : TEXT_TRAITS.includes(def.type ?? 'string') ? 'text' : 'readonly';
    // Lists and objects have no ops form to set them by.
    if (typeof value === 'object' && value !== null) editor = 'readonly';
    return {
      kind: 'trait', key, value, editor, options: values, note: overrideNote(character, 'traits', key, value),
      written: writtenTag(character, 'trait', key),
    };
  });
});

const characterChanges = computed<DevChange[]>(() => {
  const id = debugCharacter.value?.id;
  return devChanges.value.filter(c => c.kind !== 'item' && c.owner === id);
});

const statusRows = computed<StatusRow[]>(() => {
  const character = debugCharacter.value;
  if (!character) return [];
  // The first status is the character's own core; "item_" ones are what equipped items grant.
  const [, ...statuses] = character.getStatuses();
  const rows: StatusRow[] = statuses.filter(s => !s.id.startsWith('item_')).map(s => ({
    id: s.id, name: s.name || s.id, image: s.displayImage, stacks: s.currentStacks, removed: false,
  }));
  // A status removed here stays listed, so the removal can be seen and put back.
  for (const change of characterChanges.value) {
    if (change.kind !== 'status' || change.value !== 0 || !isInEffect(change)) continue;
    const template = game.characterSystem.statusesMap.get(change.key);
    rows.push({ id: change.key, name: template?.name || change.key, image: template?.image || '', stacks: 0, removed: true });
  }
  return rows;
});

// Kept when switching characters, so the same field can be compared across them.
const fieldSearch = ref('');

function matchesFieldSearch(...texts: string[]): boolean {
  const query = fieldSearch.value.trim().toLowerCase();
  return !query || texts.some(text => text.toLowerCase().includes(query));
}

const fieldSections = computed(() => [
  { title: 'Attributes', rows: attributeRows.value },
  { title: 'Stats', rows: statRows.value },
  { title: 'Resources', rows: resourceRows.value },
  { title: 'Traits', rows: traitRows.value },
].map(section => ({ ...section, rows: section.rows.filter(row => matchesFieldSearch(row.key)) })));

const shownStatusRows = computed(() => statusRows.value.filter(status => matchesFieldSearch(status.id, status.name)));

const equippedStatusCount = computed(() =>
  debugCharacter.value?.getStatuses().filter(s => s.id.startsWith('item_')).length ?? 0);

const statusOptions = computed<PickerOption[]>(() =>
  [...game.characterSystem.statusesMap.values()].map(s => ({ id: s.id, name: s.name || s.id, image: s.image || undefined })));

const addingStatus = ref(false);

const allCharacterChanges = computed(() => devChanges.value.filter(c => c.kind !== 'item'));

const changedCharacterIds = computed(() => new Set(allCharacterChanges.value.map(c => c.owner)));

/** The change behind a field, while the game still holds what it set. */
function activeChange(kind: DevChange['kind'], key: string): DevChange | undefined {
  const id = debugCharacter.value?.id;
  if (!id) return undefined;
  const change = findDevChange({ kind, owner: id, key });
  return change && isInEffect(change) ? change : undefined;
}

function wasText(change: DevChange): string {
  if (change.kind === 'status') return change.original === 0 ? 'new' : `was ×${change.original}`;
  return change.original === null ? 'was unset' : `was ${change.original}`;
}

function report(error: string | null) {
  if (error) Global.getInstance().addNotification(error);
}

function commitField(row: FieldRow, value: string | number | boolean) {
  const character = debugCharacter.value;
  if (character) report(devSet({ kind: row.kind, owner: character.id, key: row.key }, value));
}

function addStatus(statusId: string) {
  const character = debugCharacter.value;
  if (character) report(devStatus(character.id, statusId, true));
  addingStatus.value = false;
}

function removeStatus(statusId: string) {
  const character = debugCharacter.value;
  if (character) report(devStatus(character.id, statusId, false));
}

function undoChange(change: DevChange | undefined) {
  if (change) report(undoDevChanges([change]));
}

// Serializing a whole character is not cheap, so only while Raw data is open.
const rawOpen = ref(false);

const rawData = computed(() => rawOpen.value && debugCharacter.value ? debugSerialize(debugCharacter.value, 1) : '');

watch(debugId, () => { addingStatus.value = false; });
</script>

<template>
  <div class="debug-characters">
    <details v-if="!debugCharacter" class="create-character-section">
      <summary>Create New Character</summary>
      <div class="create-character-form">
        <Select v-model="selectedTemplate" :options="Array.from(game.characterSystem.templatesMap.keys())"
          placeholder="Select a template" filter class="input-control" :overlayClass="panelOverlayClass" />
        <FloatLabel variant="on">
          <!-- @vue-ignore -->
          <InputText v-model="newCharacterId" class="input-control" />
          <label for="new-character-id">Character ID</label>
        </FloatLabel>
        <Button label="Create Character" size="small" @click="createCharacter" />
      </div>
    </details>

    <!-- Browse mode: filters + the paged face grid -->
    <div v-if="!debugCharacter" class="characters-list">
      <div class="list-header">
        <h3>Characters ({{ filteredCharacters.length }}/{{ characters.length }})</h3>
        <Button v-if="activeFilterCount" label="Clear" size="small" severity="secondary" text @click="resetFilters" />
      </div>

      <div class="filters">
        <!-- @vue-ignore -->
        <InputText v-model="filters.search" placeholder="Search id, name or template" class="filter-search" />

        <div class="filter-chips">
          <button class="chip" :class="{ active: filters.hasAbilities }" title="Only characters with abilities (battlers)"
            @click="filters.hasAbilities = !filters.hasAbilities">Has Abilities</button>
          <button class="chip" :class="{ active: filters.inPartyOnly }" title="Only party members"
            @click="filters.inPartyOnly = !filters.inPartyOnly">Party</button>
          <button class="chip" :class="{ active: filters.collapseTemplates }"
            title="Show one character per template id (characters with no template are all kept)"
            @click="filters.collapseTemplates = !filters.collapseTemplates">1 per template</button>
        </div>

        <div v-if="allTags.length" class="tag-filter">
          <div class="tag-filter-header">
            <span class="filter-label">Tags</span>
            <!-- Only offered once a second tag makes the two modes differ -->
            <div v-if="filters.tags.length > 1" class="tag-mode">
              <button class="tag-mode-button" :class="{ active: filters.tagMode === 'or' }"
                title="Match any selected tag" @click="filters.tagMode = 'or'">OR</button>
              <button class="tag-mode-button" :class="{ active: filters.tagMode === 'and' }"
                title="Match every selected tag" @click="filters.tagMode = 'and'">AND</button>
            </div>
            <button v-if="filters.tags.length" class="tag-clear" @click="filters.tags = []">clear</button>
          </div>
          <div class="filter-chips tag-chips">
            <button v-for="tag in allTags" :key="tag" class="chip"
              :class="{ active: filters.tags.includes(tag) }" @click="toggleTag(tag)">{{ tag }}</button>
          </div>
        </div>

        <Select v-model="filters.sort" :options="SORT_OPTIONS" optionLabel="label" optionValue="value"
          class="filter-control" :overlayClass="panelOverlayClass" />
      </div>

      <div v-if="pagedCharacters.length" class="character-grid">
        <div v-for="character in pagedCharacters" :key="character.id" class="character-tile">
          <!-- staticFaceForce: a grid of live spine canvases would blow the WebGL context limit -->
          <div class="tile-face" :title="`Open viewer: ${characterName(character) || character.id}`"
            @click="openViewer(character)">
            <CharacterFace :character="character" :size="64" :staticFaceForce="true" />
            <span v-if="collapsedCount(character) > 1" class="tile-count"
              :title="`${collapsedCount(character)} characters share template &quot;${character.templateId}&quot;`">
              &times;{{ collapsedCount(character) }}
            </span>
          </div>
          <button class="tile-id" :title="`Debug info: ${character.id}`" @click="inspectCharacter(character)">
            <span v-if="changedCharacterIds.has(character.id)" class="tile-changed" title="Changed this playtest"></span>
            {{ character.id }}
          </button>
        </div>
      </div>
      <p v-else class="no-characters">
        {{ characters.length ? 'No characters match the filters' : 'No characters found' }}
      </p>

      <div v-if="pageCount > 1" class="grid-pagination">
        <button class="page-button" :disabled="page === 0" @click="goToPage(page - 1)">&lsaquo;</button>
        <span class="page-label">{{ page + 1 }} / {{ pageCount }}</span>
        <button class="page-button" :disabled="page >= pageCount - 1" @click="goToPage(page + 1)">&rsaquo;</button>
      </div>

      <DebugChangesBox :changes="allCharacterChanges" />
    </div>

    <!-- Inspect mode: the grid and filters give way to the one clicked face and its data -->
    <div v-else class="inspect-view">
      <button class="inspect-back" @click="closeInspect">&lsaquo; Back to list</button>

      <div class="inspect-identity">
        <div class="tile-face" :title="`Open viewer: ${characterName(debugCharacter) || debugCharacter.id}`"
          @click="openViewer(debugCharacter)">
          <CharacterFace :character="debugCharacter" :size="96" :staticFaceForce="true" />
        </div>
        <div class="inspect-labels">
          <strong>{{ debugCharacter.id }}</strong>
          <span v-if="characterName(debugCharacter)" class="inspect-name">{{ characterName(debugCharacter) }}</span>
          <span v-if="debugCharacter.templateId" class="character-template">{{ debugCharacter.templateId }}</span>
        </div>
      </div>

      <InputText v-model="fieldSearch" placeholder="Search fields and statuses" class="filter-search inspect-search" />

      <template v-for="section in fieldSections" :key="section.title">
        <section v-if="section.rows.length" class="field-section">
          <h4 class="section-title">{{ section.title }}</h4>
          <div v-for="row in section.rows" :key="row.key" class="field-row"
            :class="{ changed: activeChange(row.kind, row.key) }">
            <label class="field-label" :title="row.key">
              <template v-for="(part, i) in nameParts(row.key)" :key="i">{{ part }}<wbr></template>
            </label>
            <div class="field-control">
              <DebugEditField :editor="row.editor" :value="row.value" :options="row.options"
                @commit="commitField(row, $event)" />
              <span v-if="row.max !== undefined" class="field-max">/ {{ row.max }}</span>
              <button v-if="row.written" class="field-written" :title="row.written.title"
                @click="forgetWrite(row)">{{ row.written.text }}</button>
            </div>
            <button v-if="activeChange(row.kind, row.key)" class="field-was" title="Put it back"
              @click="undoChange(activeChange(row.kind, row.key))">{{ wasText(activeChange(row.kind, row.key)!) }}</button>
            <span v-if="row.note" class="field-note">{{ row.note }}</span>
          </div>
        </section>
      </template>

      <section class="field-section">
        <h4 class="section-title">
          Statuses
          <button v-if="statusOptions.length" class="section-link" @click="addingStatus = !addingStatus">
            {{ addingStatus ? 'Cancel' : '+ Add status' }}
          </button>
        </h4>
        <DebugPicker v-if="addingStatus" :options="statusOptions" placeholder="Search statuses" autofocus
          @pick="addStatus" />
        <div v-for="status in shownStatusRows" :key="status.id" class="field-row status-row"
          :class="{ changed: activeChange('status', status.id), removed: status.removed }">
          <img v-if="status.image" class="status-icon" :src="status.image" alt="" />
          <span class="status-name" :title="status.id">
            {{ status.name }}<span v-if="status.stacks > 1" class="status-stacks"> ×{{ status.stacks }}</span>
          </span>
          <button v-if="activeChange('status', status.id)" class="field-was" title="Put it back"
            @click="undoChange(activeChange('status', status.id))">
            {{ status.removed ? 'removed' : wasText(activeChange('status', status.id)!) }}
          </button>
          <button v-if="!status.removed" class="row-remove" :title="`Remove ${status.id}`"
            @click="removeStatus(status.id)"><i class="pi pi-times"></i></button>
        </div>
        <p v-if="!shownStatusRows.length" class="field-empty">{{ statusRows.length ? 'No match' : 'None' }}</p>
        <p v-if="equippedStatusCount" class="field-empty">
          {{ equippedStatusCount }} more from equipped items
        </p>
      </section>

      <DebugChangesBox :changes="characterChanges" />

      <details class="raw-data" @toggle="rawOpen = ($event.target as HTMLDetailsElement).open">
        <summary>Raw data</summary>
        <pre v-if="rawOpen" class="character-data">{{ rawData }}</pre>
      </details>
    </div>

    <CharacterViewerPopup v-if="viewerIndex !== null" :characters="viewerCharacters" :initialIndex="viewerIndex"
      @close="closeViewer" />
  </div>
</template>

<style scoped>
/* Painted against the host debug panel (Debug.vue), not against the game's dark glassy UI.
   That panel follows the editor's theme, so read surfaces and text from the --editor-*
   tokens rather than hardcoding the light palette it used to always have. */
.debug-characters {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  color: var(--editor-text);
}

.create-character-section {
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--editor-border-strong);
}

.create-character-section summary {
  cursor: pointer;
  font-weight: 600;
}

.create-character-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.75rem;
}

.input-control {
  width: 100%;
  max-width: 14rem;
}

.characters-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.list-header h3 {
  margin: 0;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-search,
.filter-control {
  width: 100%;
}

.inspect-search {
  margin-bottom: 0.25rem;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  padding: 0.2rem 0.6rem;
  border-radius: 1rem;
  border: 1px solid var(--editor-border-strong);
  background: var(--editor-surface-sunken);
  color: var(--editor-text-muted);
  font-size: 0.8em;
  cursor: pointer;
}

.chip:hover {
  border-color: var(--editor-border-strong);
  background: var(--editor-surface);
}

.chip.active {
  background: #42b983;
  border-color: var(--editor-ink-green);
  color: #fff;
}

.tag-filter {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tag-filter-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.8em;
  font-weight: 600;
  color: var(--editor-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tag-mode {
  display: flex;
  border: 1px solid var(--editor-border-strong);
  border-radius: 4px;
  overflow: hidden;
}

.tag-mode-button {
  padding: 0.1rem 0.45rem;
  border: none;
  background: var(--editor-surface-sunken);
  color: var(--editor-text-muted);
  font-size: 0.7em;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.tag-mode-button + .tag-mode-button {
  border-left: 1px solid var(--editor-border-strong);
}

.tag-mode-button:hover:not(.active) {
  background: var(--editor-surface);
}

.tag-mode-button.active {
  background: #42b983;
  color: #fff;
}

.tag-clear {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--editor-text-faint);
  font-size: 0.75em;
  text-decoration: underline;
  cursor: pointer;
}

.tag-clear:hover {
  color: var(--editor-text);
}

/* A game can define a lot of tags — keep the chip cloud from pushing the grid off-panel. */
.tag-chips {
  max-height: 7rem;
  overflow-y: auto;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 0.6rem;
}

.character-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.tile-face {
  position: relative;
  cursor: pointer;
  line-height: 0;
}

/* Sits on the tile wrapper, not inside CharacterFace — that clips to the face circle. */
.tile-count {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 1.1rem;
  padding: 0 0.25rem;
  border-radius: 0.6rem;
  background: #42b983;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1.1rem;
  text-align: center;
  pointer-events: none;
}

.tile-face:hover {
  filter: brightness(1.15);
}

.tile-id {
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--editor-text-muted);
  font-size: 0.72em;
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-id:hover {
  color: var(--editor-ink-green);
  text-decoration: underline;
}

.grid-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.page-button {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--editor-border-strong);
  border-radius: 50%;
  background: var(--editor-surface-sunken);
  color: var(--editor-text);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.page-button:hover:not(:disabled) {
  border-color: var(--editor-border-strong);
  background: var(--editor-surface);
}

.page-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.page-label {
  font-size: 0.85em;
  color: var(--editor-text-muted);
  font-variant-numeric: tabular-nums;
}

/* --- Inspect mode --- */
.inspect-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.inspect-back {
  align-self: flex-start;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--editor-border-strong);
  border-radius: 4px;
  background: var(--editor-surface-sunken);
  color: var(--editor-text);
  font-size: 0.85em;
  cursor: pointer;
}

.inspect-back:hover {
  border-color: var(--editor-border-strong);
  background: var(--editor-surface);
}

.inspect-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.inspect-labels {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  word-break: break-word;
}

.inspect-name {
  color: var(--editor-text-muted);
  font-size: 0.85em;
}

.character-template {
  color: var(--editor-ink-green);
  font-size: 0.85em;
}

/* --- Inspect fields --- */
.field-section,
.raw-data {
  font-size: 0.875rem;
}

.field-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0.25rem 0 0;
  color: var(--editor-text-muted);
  font-size: 0.75em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.section-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--editor-fg-success);
  font: inherit;
  font-size: 1.1em;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
}

.section-link:hover {
  text-decoration: underline;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 6rem) minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 0.45rem;
  row-gap: 0.15rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-left: 4px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
  font-size: 0.9em;
}

.field-row.changed {
  border-left-color: var(--editor-ink-amber);
  background: var(--editor-tint-warning);
}

.field-label {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.9em;
  overflow-wrap: anywhere;
}

.field-control {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}

.field-max {
  flex-shrink: 0;
  color: var(--editor-text-muted);
  font-size: 0.9em;
  font-variant-numeric: tabular-nums;
}

.field-was {
  max-width: 6rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--editor-fg-warning);
  font: inherit;
  font-size: 0.85em;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.field-was:hover {
  text-decoration: line-through;
}

.field-written {
  flex-shrink: 0;
  max-width: 7rem;
  padding: 0 0.3rem;
  border: 1px solid var(--editor-fg-info);
  border-radius: 3px;
  background: var(--editor-tint-info);
  color: var(--editor-fg-info);
  font: inherit;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.8em;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.field-written:hover {
  text-decoration: line-through;
}

.field-note {
  grid-column: 2 / -1;
  color: var(--editor-text-faint);
  font-size: 0.8em;
  overflow-wrap: anywhere;
}

.field-empty {
  margin: 0;
  padding: 0 0.3rem;
  color: var(--editor-text-faint);
  font-size: 0.85em;
}

.status-row {
  display: flex;
  min-height: 2rem;
  box-sizing: border-box;
}

.status-row.removed .status-name {
  color: var(--editor-text-faint);
  text-decoration: line-through;
}

.status-icon {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 3px;
  object-fit: contain;
}

.status-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.status-stacks {
  color: var(--editor-text-muted);
  font-variant-numeric: tabular-nums;
}

.row-remove {
  padding: 0.1rem 0.25rem;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--editor-text-faint);
  cursor: pointer;
}

.row-remove:hover {
  background: var(--editor-tint-danger);
  color: var(--editor-fg-danger);
}

.raw-data summary {
  color: var(--editor-text-muted);
  font-size: 0.9em;
  cursor: pointer;
}

.raw-data[open] summary {
  margin-bottom: 0.5rem;
}

.tile-changed {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-right: 0.2rem;
  border-radius: 50%;
  background: var(--editor-ink-amber);
  vertical-align: middle;
}

.character-data {
  background-color: var(--editor-surface-raised);
  color: var(--editor-text);
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  padding: 0.6rem;
  overflow-x: auto;
  margin: 0;
  font-size: 0.9em;
  line-height: 1.5;
}

.no-characters {
  color: var(--editor-text-faint);
  font-style: italic;
}
</style>
