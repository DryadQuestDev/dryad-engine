<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import { renderManifestDescription, changelogLabels } from '../../../global/views/main-screen/changelog';
import { startPlaytest } from '../editor-screen/usePlaytest';

const editor = Editor.getInstance();
const global = Global.getInstance();

type TemplateCard = { id: string; name: string; description: string; cover: string; youGet: string; order: number };

const templates = ref<TemplateCard[]>([]);
const selectedTemplate = ref('');
const gameName = ref('');
const author = ref('');
const chapterName = ref('Chapter 1');
const showMore = ref(false);
const creating = ref(false);

function toId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const gameId = computed(() => toId(gameName.value));
// A line starting with a content marker would open a new block under $dungeon_name.
const chapterDisplay = computed(() => chapterName.value.replace(/^[\s^@!$#%>~/]+/, '').trim() || 'Chapter 1');
const dungeonId = computed(() => toId(chapterDisplay.value) || 'chapter_1');
// editor.games is a plain array; filteredGames is the ref the editor refreshes whenever that list
// changes, so reading it keeps these lists current.
const allGames = computed(() => {
  void editor.filteredGames.value;
  return [...editor.games];
});
const idTaken = computed(() => !!gameId.value && allGames.value.some(g => g.id === gameId.value));
const canCreate = computed(() => !!selectedTemplate.value && !!gameId.value && !idTaken.value && !creating.value && !global.isWebSite);
const selected = computed(() => templates.value.find(t => t.id === selectedTemplate.value));

const samples = computed(() => allGames.value.filter(g => g.sample));
const games = computed(() => {
  const list = allGames.value.filter(g => !g.sample);
  const last = editor.selectedGame;
  return [...list].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : (a.name || a.id).localeCompare(b.name || b.id)));
});

async function loadTemplates() {
  const folders = await global.listFolders('engine_files/examples').catch(() => [] as string[]);
  const loaded: TemplateCard[] = [];
  for (const folder of folders) {
    const manifest = await global.readJson(`engine_files/examples/${folder}/_core/manifest.json`).catch(() => null);
    if (!manifest) continue;
    const meta = await global.readJson(`engine_files/examples/${folder}/template.json`).catch(() => null);
    loaded.push({
      id: folder,
      name: manifest.name || folder,
      description: renderManifestDescription(manifest, changelogLabels(() => ''), false),
      cover: Array.isArray(manifest.cover_assets) ? manifest.cover_assets[0] ?? '' : '',
      youGet: meta?.you_get || '',
      order: typeof meta?.order === 'number' ? meta.order : 999,
    });
  }
  loaded.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  templates.value = loaded;
  if (!selectedTemplate.value && loaded.length) selectedTemplate.value = loaded[0].id;
}

async function createGame() {
  if (!canCreate.value) return;
  creating.value = true;
  try {
    await editor.createGameFromTemplate({
      templateId: selectedTemplate.value,
      gameId: gameId.value,
      gameName: gameName.value.trim(),
      author: author.value,
      dungeonId: dungeonId.value,
      dungeonName: chapterDisplay.value,
    });
  } finally {
    creating.value = false;
  }
}

/** Open a game where its writing happens: its starting dungeon's Content tab. */
async function openGame(id: string) {
  await editor.setGame(id);
  if (editor.selectedGame !== id) return;
  const manifest = editor.games.find(g => g.id === id);
  if (manifest?.starting_dungeon_id) {
    editor.state.selectedSubTabs['dungeons'] = 'content';
    await editor.setDungeon(manifest.starting_dungeon_id, true);
    await editor.setMainTab('dungeons');
  } else {
    await editor.setMainTab('general');
  }
}

async function playSample(id: string) {
  await editor.setGame(id);
  if (editor.selectedGame === id) await startPlaytest();
}

function openDocs(page: string) {
  global.openDocs('global_essentials', page);
}

async function startEmpty(subtab: 'new_game' | 'new_mod') {
  editor.state.selectedSubTabs['new'] = subtab;
  await editor.setMainTab('new');
}

onMounted(loadTemplates);
</script>

<template>
  <div class="start-page">
    <div class="start-main">
      <h1>Start</h1>
      <p class="start-sub">Make a game, open one, or learn the editor.</p>

      <h2>Create a game</h2>
      <div v-if="global.isWebSite" class="start-web-note">
        Creating games is not available in the web demo. Download the app to make games.
      </div>
      <div class="start-cards">
        <button v-for="(t, i) in templates" :key="t.id" type="button" class="start-card"
          :class="{ 'start-card--selected': t.id === selectedTemplate }" :disabled="global.isWebSite"
          @click="selectedTemplate = t.id">
          <span v-if="i === 0" class="start-card-tag">Start here</span>
          <span v-if="t.id === selectedTemplate" class="start-card-check"><i class="pi pi-check" /></span>
          <img v-if="t.cover" :src="t.cover" alt="" class="start-card-cover" />
          <div v-else class="start-card-cover start-card-cover--empty"></div>
          <span class="start-card-body">
            <b>{{ t.name }}</b>
            <span class="start-card-desc" v-html="t.description"></span>
          </span>
        </button>
      </div>
      <div v-if="selected?.youGet" class="start-youget"><b>You get</b> {{ selected.youGet }}</div>

      <div class="start-form">
        <div class="start-field">
          <label for="start-game-name">Game name</label>
          <InputText id="start-game-name" v-model="gameName" placeholder="My Visual Novel" :disabled="global.isWebSite"
            :invalid="idTaken" @keydown.enter="createGame" />
        </div>
        <Button label="Create game" icon="pi pi-plus" severity="success" :disabled="!canCreate" :loading="creating"
          @click="createGame" />
        <button type="button" class="start-more-toggle" @click="showMore = !showMore">
          {{ showMore ? 'Fewer options' : 'More options' }}
        </button>
      </div>
      <small v-if="idTaken" class="start-error">A game with the id <code>{{ gameId }}</code> already exists.</small>
      <small v-else-if="gameId" class="start-hint">Saved as <code>{{ gameId }}</code></small>
      <div v-if="showMore" class="start-more">
        <div class="start-field">
          <label for="start-author">Author <span class="start-optional">optional</span></label>
          <InputText id="start-author" v-model="author" />
        </div>
        <div class="start-field">
          <label for="start-chapter">First chapter</label>
          <InputText id="start-chapter" v-model="chapterName" />
          <small class="start-hint">A chapter is one dungeon: a place or a part of your story.</small>
        </div>
      </div>

      <div class="start-other">
        Other ways to start:
        <button type="button" class="start-link" @click="startEmpty('new_game')">Empty game</button>
        <span aria-hidden="true">·</span>
        <button type="button" class="start-link" @click="startEmpty('new_mod')">New mod</button>
      </div>
    </div>

    <aside class="start-side">
      <h2>Learn</h2>
      <button type="button" class="start-item start-item--highlight" @click="openDocs('introduction/first_15_minutes')">
        <span><i class="pi pi-play" /> Your first 15 minutes</span>
        <small>Make a scene, play it, change it</small>
      </button>
      <button type="button" class="start-item" @click="openDocs('introduction/coming_from_renpy')">
        <span>Coming from Ren'Py</span>
        <small>label, menu, jump, define… in Dryad terms</small>
      </button>
      <button type="button" class="start-item" @click="openDocs('introduction/coming_from_twine')">
        <span>Coming from Twine</span>
        <small>passages, links and $variables</small>
      </button>
      <div v-for="g in samples" :key="g.id" class="start-item start-item--sample">
        <span>{{ g.name || g.id }}</span>
        <small>Play it, then open it to see how it's made</small>
        <span class="start-item-actions">
          <Button label="Play" icon="pi pi-play" size="small" @click="playSample(g.id)" />
          <Button label="Open" size="small" severity="secondary" outlined @click="openGame(g.id)" />
        </span>
      </div>

      <template v-if="games.length">
        <h2 class="start-side-gap">Your games</h2>
        <button v-for="g in games" :key="g.id" type="button" class="start-item" @click="openGame(g.id)">
          <span>{{ g.name || g.id }}</span>
          <small>{{ g.id === editor.selectedGame ? 'Last opened' : g.id }}</small>
        </button>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.start-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 2rem;
  padding: 1.5rem 2rem 2rem;
  height: 100%;
  overflow-y: auto;
  color: var(--editor-text);
}

h1 {
  font-size: 1.9rem;
  margin: 0 0 0.25rem;
}

h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--editor-text-muted);
  margin: 0 0 0.75rem;
}

.start-sub {
  color: var(--editor-text-muted);
  margin: 0 0 1.25rem;
}

.start-web-note {
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  background: var(--editor-tint-warning);
  color: var(--editor-fg-warning);
}

.start-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.start-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0;
  text-align: left;
  border: 1px solid var(--editor-border);
  border-radius: 12px;
  background: var(--editor-surface-raised);
  color: inherit;
  font: inherit;
  overflow: hidden;
  cursor: pointer;
}

.start-card:disabled {
  cursor: default;
  opacity: 0.7;
}

.start-card--selected {
  border: 2px solid var(--editor-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--editor-accent) 18%, transparent);
}

.start-card-cover {
  width: 100%;
  height: 140px;
  object-fit: cover;
  display: block;
}

.start-card-cover--empty {
  background: var(--editor-surface-sunken);
}

.start-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 0.9rem 0.9rem;
}

.start-card-body b {
  font-size: 1.05rem;
}

.start-card-desc {
  color: var(--editor-text-muted);
  font-size: 0.9rem;
  line-height: 1.4;
}

.start-card-desc :deep(p) {
  margin: 0;
}

.start-card-tag {
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.8);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
}

.start-card-check {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--editor-accent);
  color: var(--editor-accent-contrast);
}

.start-youget {
  margin: 1rem 0 1.1rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  background: var(--editor-surface-raised);
  line-height: 1.5;
}

.start-form,
.start-more {
  display: flex;
  align-items: flex-end;
  gap: 0.9rem;
  flex-wrap: wrap;
}

.start-more {
  margin-top: 0.9rem;
}

.start-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 18rem;
}

.start-field label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--editor-text-muted);
}

.start-optional {
  font-weight: 400;
  color: var(--editor-text-faint);
}

.start-more-toggle,
.start-link {
  border: none;
  background: none;
  padding: 0.5rem 0;
  color: var(--editor-accent);
  font: inherit;
  cursor: pointer;
}

.start-hint {
  display: block;
  margin-top: 0.4rem;
  color: var(--editor-text-muted);
}

.start-error {
  display: block;
  margin-top: 0.4rem;
  color: var(--editor-fg-danger);
}

.start-other {
  margin-top: 2rem;
  color: var(--editor-text-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.start-side {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.start-side-gap {
  margin-top: 1rem;
}

.start-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.7rem 0.9rem;
  text-align: left;
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  background: var(--editor-surface-raised);
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button.start-item:hover {
  background: var(--editor-surface-hover);
}

.start-item small {
  font-weight: 400;
  color: var(--editor-text-muted);
}

.start-item--highlight {
  border-color: var(--editor-accent);
  background: var(--editor-tint-info);
}

.start-item--sample {
  cursor: default;
}

.start-item-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.4rem;
}
</style>
