<script setup lang="ts">
import { Game } from '../../game';
import { ref, shallowRef, computed, reactive, watch, isRef } from 'vue';
import type { ComputedRef } from 'vue';
import { useStorage } from '@vueuse/core';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import type { Character, FinalAbilities } from '../../core/character/character';
import { debugSerialize } from '../../../utility/debug-serializer';
import { Status } from '../../core/character/status';
import CharacterFace from '../CharacterFace.vue';
import CharacterViewerPopup from '../progression/CharacterViewerPopup.vue';

const game = Game.getInstance();

const selectedTemplate = ref<string | null>(null);
const newCharacterId = ref<string>('');
const selectedStatus = ref<string | null>(null);
const selectedResource = ref<string | null>(null);
const resourceAmount = ref<number>(10);

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

const resourceStats = computed(() => {
  const stats: string[] = [];
  for (const [id, stat] of game.characterSystem.statsMap) {
    if (stat.is_resource) stats.push(id);
  }
  return stats;
});

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
  // Characters in the map are reactive proxies, and Vue unwraps refs held on a reactive object —
  // so getAbilities() hands back the plain FinalAbilities here, not the ComputedRef it declares.
  // isRef covers both, since an unproxied instance really does return the ref.
  const abilities = character.getAbilities() as ComputedRef<FinalAbilities> | FinalAbilities;
  const final = isRef(abilities) ? abilities.value : abilities;
  return Object.keys(final ?? {}).length > 0;
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

function addStatusToCharacter(character: Character, statusId: string | null) {
  if (!statusId) {
    console.warn('No status selected');
    return;
  }

  const statusTemplate = game.characterSystem.statusesMap.get(statusId);
  if (!statusTemplate) {
    console.error(`Status template "${statusId}" not found`);
    return;
  }

  // Create a new Status instance
  const status = reactive(new Status());
  status.id = statusId;
  status.setValues(statusTemplate);

  // Add status to character
  character.addStatus(status);

  console.log(`Added status "${statusId}" to character "${character.id}"`);
}

function addResourceToCharacter(character: Character, statId: string | null, amount: number) {
  if (!statId) return;
  character.addResource(statId, amount);
  console.log(`Added ${amount} "${statId}" to character "${character.id}"`);
}

function formatCharacterData(character: any) {
  return debugSerialize(character, 1);
}
</script>

<template>
  <div class="debug-characters">
    <details v-if="!debugCharacter" class="create-character-section">
      <summary>Create New Character</summary>
      <div class="create-character-form">
        <Select v-model="selectedTemplate" :options="Array.from(game.characterSystem.templatesMap.keys())"
          placeholder="Select a template" filter class="input-control" />
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
          class="filter-control" />
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

      <div class="character-actions">
        <h4>Add Status Effect</h4>
        <div class="status-controls">
          <Select v-model="selectedStatus" :options="Array.from(game.characterSystem.statusesMap.keys())"
            placeholder="Select status" filter class="status-select" />
          <Button label="Add Status" size="small" @click="addStatusToCharacter(debugCharacter, selectedStatus)" />
        </div>

        <h4>Add Resource</h4>
        <div class="status-controls">
          <Select v-model="selectedResource" :options="resourceStats" placeholder="Select resource"
            class="status-select" />
          <!-- @vue-ignore -->
          <InputNumber v-model="resourceAmount" class="resource-amount" />
          <Button label="Add" size="small"
            @click="addResourceToCharacter(debugCharacter, selectedResource, resourceAmount)" />
        </div>
      </div>

      <pre class="character-data">{{ formatCharacterData(debugCharacter) }}</pre>
    </div>

    <CharacterViewerPopup v-if="viewerIndex !== null" :characters="viewerCharacters" :initialIndex="viewerIndex"
      @close="closeViewer" />
  </div>
</template>

<style scoped>
/* The host debug panel (Debug.vue) is a LIGHT surface — rgb(220, 220, 220) with dark text.
   Everything here is painted against that, not against the game's dark glassy UI. */
.debug-characters {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  color: #333;
}

.create-character-section {
  padding-bottom: 1rem;
  border-bottom: 1px solid #bbb;
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

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  padding: 0.2rem 0.6rem;
  border-radius: 1rem;
  border: 1px solid #bbb;
  background: #f5f5f5;
  color: #555;
  font-size: 0.8em;
  cursor: pointer;
}

.chip:hover {
  border-color: #888;
  background: #fff;
}

.chip.active {
  background: #42b983;
  border-color: #369e6e;
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
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tag-mode {
  display: flex;
  border: 1px solid #bbb;
  border-radius: 4px;
  overflow: hidden;
}

.tag-mode-button {
  padding: 0.1rem 0.45rem;
  border: none;
  background: #f5f5f5;
  color: #555;
  font-size: 0.7em;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.tag-mode-button + .tag-mode-button {
  border-left: 1px solid #bbb;
}

.tag-mode-button:hover:not(.active) {
  background: #fff;
}

.tag-mode-button.active {
  background: #42b983;
  color: #fff;
}

.tag-clear {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #777;
  font-size: 0.75em;
  text-decoration: underline;
  cursor: pointer;
}

.tag-clear:hover {
  color: #333;
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
  color: #555;
  font-size: 0.72em;
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-id:hover {
  color: #2a8f66;
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
  border: 1px solid #bbb;
  border-radius: 50%;
  background: #f5f5f5;
  color: #333;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.page-button:hover:not(:disabled) {
  border-color: #888;
  background: #fff;
}

.page-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.page-label {
  font-size: 0.85em;
  color: #555;
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
  border: 1px solid #bbb;
  border-radius: 4px;
  background: #f5f5f5;
  color: #333;
  font-size: 0.85em;
  cursor: pointer;
}

.inspect-back:hover {
  border-color: #888;
  background: #fff;
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
  color: #555;
  font-size: 0.85em;
}

.character-template {
  color: #2a8f66;
  font-size: 0.85em;
}

.character-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: #e4e4e4;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.character-actions h4 {
  margin: 0;
  font-size: 0.95em;
  font-weight: 600;
}

.status-controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
}

.status-select {
  width: 100%;
  max-width: 14rem;
}

.character-data {
  background-color: #fbfbfb;
  color: #222;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.6rem;
  overflow-x: auto;
  margin: 0;
  font-size: 0.9em;
  line-height: 1.5;
}

.no-characters {
  color: #777;
  font-style: italic;
}
</style>
