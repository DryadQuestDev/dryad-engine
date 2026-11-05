<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import { Game } from '../../game';

const game = Game.getInstance();
const ds = game.dungeonSystem;

type Entry = { goalId: string; logId: string; text: string; ends: boolean; logged: boolean; missing: boolean };
type QuestRow = { dungeonId: string; questId: string; title: string; missing: boolean; entries: Entry[] };
type DungeonGroup = { dungeonId: string; name: string; quests: QuestRow[] };

const search = useStorage('debug-quests-search', '');
const savedOnly = useStorage('debug-quests-saved-only', false);
/** The dungeon chip picked; '' shows every dungeon. */
const pickedDungeon = useStorage('debug-quests-dungeon', '');
const collapsed = ref<Set<string>>(new Set());

function plain(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
}

function isLogged(dungeonId: string, questId: string, goalId: string, logId: string): boolean {
  return !!ds.quests.value.get(`${dungeonId}.${questId}`)?.goals.find(g => g.id === goalId)?.logs.includes(logId);
}

// Every quest the content defines ($quest.goal = goal title, $quest.goal.log = entry), plus whatever the save holds
// that the content no longer has, so an orphan from a renamed or merged quest can be seen and removed.
const groups = computed<DungeonGroup[]>(() => {
  const byKey = new Map<string, QuestRow>();
  const row = (dungeonId: string, questId: string) => {
    const key = `${dungeonId}.${questId}`;
    let q = byKey.get(key);
    if (!q) {
      q = { dungeonId, questId, title: questId, missing: false, entries: [] };
      byKey.set(key, q);
    }
    return q;
  };
  for (const [dungeonId, lines] of ds.dungeonLines) {
    for (const [id, line] of lines) {
      const m = /^\$([^.]+)\.([^.]+)(?:\.(.+))?$/.exec(id);
      if (!m) continue;
      const [, questId, goalId, logId] = m;
      const q = row(dungeonId, questId);
      if (logId === undefined || logId === '') {
        if (goalId === 'main') q.title = plain(line.val || '') || questId;
        continue;
      }
      q.entries.push({
        goalId, logId, text: plain(line.val || ''), ends: line.params?.progress === 2,
        logged: isLogged(dungeonId, questId, goalId, logId), missing: false,
      });
    }
  }
  for (const quest of ds.quests.value.values()) {
    const q = row(quest.dungeonId, quest.id);
    if (!ds.hasQuestDefinition(quest.dungeonId, quest.id)) q.missing = true;
    for (const goal of quest.goals) {
      for (const logId of goal.logs) {
        if (q.entries.some(e => e.goalId === goal.id && e.logId === logId)) continue;
        q.entries.push({ goalId: goal.id, logId, text: '', ends: false, logged: true, missing: true });
      }
    }
  }

  const needle = search.value.trim().toLowerCase();
  const out = new Map<string, DungeonGroup>();
  for (const q of byKey.values()) {
    if (!q.entries.length) continue;
    if (savedOnly.value && !q.entries.some(e => e.logged)) continue;
    if (needle && ![q.dungeonId, q.questId, q.title].some(s => s.toLowerCase().includes(needle))) continue;
    let g = out.get(q.dungeonId);
    if (!g) {
      g = { dungeonId: q.dungeonId, name: ds.getDungeonName(q.dungeonId), quests: [] };
      out.set(q.dungeonId, g);
    }
    g.quests.push(q);
  }
  // Alphabetical, with the dungeon the player is standing in first.
  const here = ds.currentDungeonId.value;
  return [...out.values()].sort((a, b) =>
    Number(b.dungeonId === here) - Number(a.dungeonId === here) || a.name.localeCompare(b.name));
});

type Chip = { dungeonId: string; name: string; count: number; missing: boolean };
const chips = computed<Chip[]>(() => groups.value.map(g => ({
  dungeonId: g.dungeonId,
  name: g.name,
  count: g.quests.length,
  missing: g.quests.some(q => q.missing || q.entries.some(e => e.missing)),
})));

// A pick that the search or the filter has emptied falls back to every dungeon rather than an empty list.
const activeDungeon = computed(() => chips.value.some(c => c.dungeonId === pickedDungeon.value) ? pickedDungeon.value : '');
const shownGroups = computed(() => activeDungeon.value ? groups.value.filter(g => g.dungeonId === activeDungeon.value) : groups.value);
const questCount = computed(() => shownGroups.value.reduce((n, g) => n + g.quests.length, 0));

function toggle(q: QuestRow, e: Entry) {
  if (e.logged) ds.removeQuestLog(q.dungeonId, q.questId, e.goalId, e.logId);
  else game.execute({ quest: `${q.dungeonId}.${q.questId}.${e.goalId}.${e.logId}` });
}

function toggleCollapsed(key: string) {
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  collapsed.value = next;
}
</script>

<template>
  <div class="debug-quests">
    <input v-model="search" class="quest-search" type="search" placeholder="Search quests or dungeons" />
    <label class="saved-only">
      <input v-model="savedOnly" type="checkbox" /> In save only
    </label>
    <div v-if="chips.length" class="chips">
      <button class="chip" :class="{ active: !activeDungeon }" @click="pickedDungeon = ''">All</button>
      <button v-for="c in chips" :key="c.dungeonId" class="chip" :class="{ active: activeDungeon === c.dungeonId }"
        :title="c.dungeonId" @click="pickedDungeon = c.dungeonId">
        <span v-if="c.missing" class="chip-missing" title="Has quests or entries the content no longer defines"></span>
        {{ c.name }} <span class="chip-count">{{ c.count }}</span>
      </button>
    </div>
    <p v-if="!questCount" class="empty">No quests found</p>

    <section v-for="g in shownGroups" :key="g.dungeonId" class="dungeon-group">
      <h4 class="dungeon-title">{{ g.name }} <code>{{ g.dungeonId }}</code></h4>
      <div v-for="q in g.quests" :key="q.questId" class="quest" :class="{ missing: q.missing }">
        <button class="quest-head" @click="toggleCollapsed(`${q.dungeonId}.${q.questId}`)">
          <i class="pi" :class="collapsed.has(`${q.dungeonId}.${q.questId}`) ? 'pi-chevron-right' : 'pi-chevron-down'"></i>
          <span class="quest-title">{{ q.title }}</span>
          <code class="quest-id">{{ q.questId }}</code>
          <span v-if="q.missing" class="badge badge-missing" title="In the save but not in the content">missing</span>
        </button>
        <div v-if="!collapsed.has(`${q.dungeonId}.${q.questId}`)" class="entries">
          <div v-for="e in q.entries" :key="`${e.goalId}.${e.logId}`" class="entry"
            :class="{ logged: e.logged, missing: e.missing }">
            <template v-if="e.missing">
              <button class="entry-remove" title="Remove it from the save" @click="toggle(q, e)">
                <i class="pi pi-times"></i>
              </button>
            </template>
            <input v-else type="checkbox" :checked="e.logged"
              :title="e.logged ? 'Remove it from the save' : 'Log it, as {quest} would'" @change="toggle(q, e)" />
            <code class="entry-id">{{ e.goalId }}.{{ e.logId }}</code>
            <span v-if="e.ends" class="badge badge-ends" title="This entry completes the quest">ends</span>
            <span v-if="e.missing" class="badge badge-missing" title="In the save but not in the content">missing</span>
            <span v-if="e.text" class="entry-text" :title="e.text">{{ e.text }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Painted against the host debug panel (Debug.vue), which follows the editor's theme. */
.debug-quests {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  color: var(--editor-text);
  font-size: 0.875rem;
}

.quest-search {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 5px;
  background: var(--dp-control-hover, var(--editor-surface));
  color: var(--editor-text);
  font: inherit;
}

.quest-search:focus {
  outline: none;
  border-color: var(--editor-accent);
}

.saved-only {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--editor-text-muted);
  font-size: 0.9em;
  cursor: pointer;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--editor-border-strong);
  border-radius: 1rem;
  background: var(--editor-surface-sunken);
  color: var(--editor-text-muted);
  font: inherit;
  font-size: 0.8em;
  cursor: pointer;
}

.chip:hover {
  background: var(--editor-surface);
}

.chip.active {
  background: #42b983;
  border-color: var(--editor-ink-green);
  color: #fff;
}

.chip-count {
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.chip-missing {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--editor-ink-amber);
}

.dungeon-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.dungeon-title {
  margin: 0.4rem 0 0;
  color: var(--editor-text-muted);
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.dungeon-title code {
  color: var(--editor-text-faint);
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

.quest {
  border: 1px solid var(--dp-border, var(--editor-border));
  border-left: 4px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
}

.quest.missing {
  border-left-color: var(--editor-ink-amber);
}

.quest-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.35rem 0.45rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.quest-head .pi {
  font-size: 0.7em;
  color: var(--editor-text-faint);
}

.quest-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.quest-id,
.entry-id {
  color: var(--editor-text-faint);
  font-size: 0.8em;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0 0.45rem 0.4rem 1.4rem;
}

.entry {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-width: 0;
}

.entry input[type='checkbox'] {
  flex-shrink: 0;
  cursor: pointer;
}

.entry.logged .entry-id {
  color: var(--editor-text);
}

.entry-text {
  overflow: hidden;
  color: var(--editor-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-remove {
  flex-shrink: 0;
  padding: 0.05rem 0.2rem;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--editor-text-faint);
  cursor: pointer;
}

.entry-remove:hover {
  background: var(--editor-tint-danger);
  color: var(--editor-fg-danger);
}

.badge {
  flex-shrink: 0;
  padding: 0 0.35rem;
  border-radius: 999px;
  font-size: 0.72em;
  font-weight: 700;
}

.badge-missing {
  background: var(--editor-tint-warning);
  color: var(--editor-fg-warning);
}

.badge-ends {
  background: var(--editor-surface-hover);
  color: var(--editor-text-muted);
}

.empty {
  margin: 0;
  padding: 1rem 0;
  color: var(--editor-text-faint);
  font-style: italic;
  text-align: center;
}
</style>
