<script setup lang="ts">
import { computed, ref } from 'vue';
import { Game } from '../../game';
import type { AccoladeObject } from '../../../schemas/accoladeSchema';

const game = Game.getInstance();
const system = game.accoladeSystem;

// Opaque on purpose: every color-mix() below inherits the alpha of --tier-color, so a
// translucent fallback would ghost the whole earned treatment on an untiered accolade.
const DEFAULT_TIER_COLOR = '#8E978C';

type Card = {
  def: AccoladeObject;
  earned: boolean;
  masked: boolean;
  color: string;
  points: number;
  progress: { current: number; target: number } | null;
};

type CardFilter = 'all' | 'earned' | 'locked';

const L = (id: string) => system.line(id);
type GroupSection = { id: string; name: string; cards: Card[]; earned: number };

function tierColor(tierId: string | undefined): string {
  return (tierId && system.tiers.get(tierId)?.color) || DEFAULT_TIER_COLOR;
}

const cards = computed<Card[]>(() => {
  return [...system.accolades.values()]
    .filter(def => !def.disabled)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(def => {
      const earned = system.isAccoladeCompleted(def.id);
      const masked = !!def.hidden && !earned;
      const target = system.getAccoladeTarget(def.id);
      const showBar = !earned && !masked && def.show_progress !== false && target > 1;
      return {
        def,
        earned,
        masked,
        color: tierColor(def.tier),
        points: system.getAccoladePoints(def.id),
        progress: showBar ? { current: Math.min(system.getAccoladeProgress(def.id), target), target } : null,
      };
    });
});

const sections = computed<GroupSection[]>(() => {
  const byGroup = new Map<string, Card[]>();
  for (const card of cards.value) {
    const groupId = card.def.group || '';
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId)!.push(card);
  }
  const ordered = [...system.groups.values()].sort((a, b) => (a.order || 0) - (b.order || 0));
  const result: GroupSection[] = [];
  for (const group of ordered) {
    const groupCards = byGroup.get(group.id);
    if (!groupCards) continue;
    byGroup.delete(group.id);
    result.push({ id: group.id, name: group.name, cards: groupCards, earned: groupCards.filter(c => c.earned).length });
  }
  // accolades pointing at no (or an unknown) group still render, at the end
  for (const [groupId, groupCards] of byGroup) {
    result.push({ id: groupId || 'other', name: groupId || 'Other', cards: groupCards, earned: groupCards.filter(c => c.earned).length });
  }
  return result;
});

// Local, unsaved: only the selected group's cards render, so a big catalog stays one grid.
const selectedGroup = ref<string | null>(null);

// Falls back to the first section, which also covers a group emptied by a mod or disabled rows.
const activeSection = computed<GroupSection | null>(() =>
  sections.value.find(section => section.id === selectedGroup.value) || sections.value[0] || null
);

const FILTERS: { id: CardFilter; line: string }[] = [
  { id: 'all', line: 'accolades.filter_all' },
  { id: 'earned', line: 'accolades.filter_earned' },
  { id: 'locked', line: 'accolades.filter_locked' },
];

// Saved, unlike selectedGroup: which group you are looking at is a cursor, but "stop listing
// the ones I already did" is a standing instruction — the call the quest log already makes.
const filter = computed<CardFilter>({
  get: () => game.getState<CardFilter>('accolades_filter'),
  set: (value: CardFilter) => game.setState('accolades_filter', value),
});

// Filtered at render time only, so the summary, the ladder and the group counts keep
// scoring the whole catalog whatever the view is set to.
const visibleCards = computed<Card[]>(() => {
  const list = activeSection.value?.cards || [];
  if (filter.value === 'earned') return list.filter(card => card.earned);
  if (filter.value === 'locked') return list.filter(card => !card.earned);
  return list;
});

function filterCount(id: CardFilter): number {
  const section = activeSection.value;
  if (!section) return 0;
  if (id === 'earned') return section.earned;
  if (id === 'locked') return section.cards.length - section.earned;
  return section.cards.length;
}

const earnedCount = computed(() => cards.value.filter(c => c.earned).length);
const totalCount = computed(() => cards.value.length);
const earnedPoints = computed(() => system.getEarnedPoints());
const totalPoints = computed(() => system.getTotalPoints());
const percent = computed(() => (totalCount.value ? Math.round((earnedCount.value / totalCount.value) * 100) : 0));

const ladder = computed(() => {
  return [...system.tiers.values()]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(tier => {
      const tierCards = cards.value.filter(c => c.def.tier === tier.id);
      return { id: tier.id, name: tier.name, color: tier.color || DEFAULT_TIER_COLOR, earned: tierCards.filter(c => c.earned).length, total: tierCards.length };
    })
    .filter(rung => rung.total > 0);
});

function barWidth(progress: { current: number; target: number }): string {
  return `${Math.min(100, Math.round((progress.current / progress.target) * 100))}%`;
}
</script>

<template>
  <div class="accolades-tab">
    <div class="head">
      <div class="summary">
        <span class="count"><b>{{ earnedCount }}</b> / {{ totalCount }} {{ L('accolades.earned') }} · {{ percent }}%</span>
        <span v-if="totalPoints" class="points"><b>{{ earnedPoints }}</b> / {{ totalPoints }} {{ L('accolades.points') }}</span>
      </div>
      <div class="ladder">
        <span v-for="rung in ladder" :key="rung.id" class="rung">
          <i :style="{ background: rung.color }"></i>{{ rung.name }} <b :style="{ color: rung.color }">{{ rung.earned }}/{{ rung.total }}</b>
        </span>
      </div>
      <div class="bigbar"><i :style="{ width: percent + '%' }"></i></div>
    </div>

    <div v-if="sections.length" class="controls">
      <div class="subtabs">
        <div
          v-for="section in sections" :key="section.id"
          class="subtab" :class="{ active: section.id === activeSection?.id }"
          @click="selectedGroup = section.id"
        >
          <span class="subtab-name">{{ section.name }}</span>
          <span class="subtab-count">{{ section.earned }} / {{ section.cards.length }}</span>
        </div>
      </div>

      <div class="filterbar">
        <button
          v-for="option in FILTERS" :key="option.id"
          type="button" class="seg" :class="{ active: filter === option.id }"
          :aria-pressed="filter === option.id"
          @click="filter = option.id"
        >
          {{ L(option.line) }}<span class="seg-count">{{ filterCount(option.id) }}</span>
        </button>
      </div>
    </div>

    <div class="panel">
      <div v-if="!totalCount" class="empty">{{ L('accolades.empty') }}</div>

      <div v-else-if="visibleCards.length" class="grid">
        <div
          v-for="card in visibleCards" :key="card.def.id"
          class="card" :class="{ earned: card.earned, masked: card.masked }"
          :style="{ '--tier-color': card.color }"
        >
          <div class="medallion">{{ card.earned ? '✓' : card.masked ? '?' : '✦' }}</div>
          <div class="body">
            <div class="name">{{ card.masked ? '? ? ?' : card.def.name }}</div>
            <div class="desc">{{ card.masked ? L('accolades.hidden') : card.def.description }}</div>
            <div v-if="card.earned || card.progress || card.points" class="foot">
              <span v-if="card.earned" class="done">{{ L('accolades.completed') }}</span>
              <template v-else-if="card.progress">
                <span class="bar"><i :style="{ width: barWidth(card.progress) }"></i></span>
                <span class="frac">{{ card.progress.current }}/{{ card.progress.target }}</span>
              </template>
              <span v-if="card.points" class="pts">+{{ card.points }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty">{{ L('accolades.filter_empty') }}</div>
    </div>
  </div>
</template>

<style scoped>
.accolades-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.4rem 0;
}

.head {
  flex: 0 0 auto;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  margin-bottom: 1.2rem;
}

.summary { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }

.count { font-size: 1rem; color: rgba(255, 255, 255, 0.85); }
.count b { color: rgba(255, 255, 255, 1); font-size: 1.2rem; }

.points {
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
}
.points b { color: rgba(255, 255, 255, 0.9); font-size: 1rem; }

/* Grey while locked: a saturated tier colour anywhere inside a card body now means earned. */
.pts {
  margin-left: auto;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.3);
  font-variant-numeric: tabular-nums;
}

.ladder { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.6rem 0; }

.rung {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.6);
}
.rung i { width: 8px; height: 8px; border-radius: 2px; transform: rotate(45deg); }

.bigbar {
  height: 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}
.bigbar i {
  display: block;
  height: 100%;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 4px;
  transition: width 0.4s ease;
}

/* The group pills wrap inside their own box, so the filter stays pinned right whatever
   the group count is. */
.controls {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 0.9rem;
}

.subtabs {
  flex: 1 1 auto;
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.subtab {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 6px 12px;
  border-radius: 7px;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.subtab:hover { background: rgba(0, 0, 0, 0.45); }

.subtab.active {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.28);
}

.subtab-name {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}

.subtab.active .subtab-name { color: rgba(255, 255, 255, 0.95); }

.subtab-count {
  font-size: 0.66rem;
  color: rgba(255, 255, 255, 0.35);
  font-variant-numeric: tabular-nums;
}

.subtab.active .subtab-count { color: rgba(255, 255, 255, 0.6); }

.filterbar {
  flex: 0 0 auto;
  margin-left: auto;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.seg {
  appearance: none;
  font: inherit;
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 5px 11px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.45);
  transition: background 0.2s ease, color 0.2s ease;
}

.seg:hover { color: rgba(255, 255, 255, 0.8); }
.seg.active { background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.95); }
.seg:focus-visible { outline: 1px solid rgba(255, 255, 255, 0.45); outline-offset: 1px; }

.seg-count {
  font-size: 0.66rem;
  font-weight: 500;
  letter-spacing: 0;
  color: rgba(255, 255, 255, 0.35);
  font-variant-numeric: tabular-nums;
}
.seg.active .seg-count { color: rgba(255, 255, 255, 0.6); }

/* Only the panel scrolls, so the summary and the group tabs stay put. */
.panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 2rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.6rem;
}

/* --accent is the rail and the bar: the rail's job is WHICH TIER, so it keeps a readable
   hue while locked and only goes full strength once earned — state is carried by the ground,
   the medallion and the label instead. position: relative is load-bearing: .card is a grid
   container, so an unpositioned ::after would become a grid item and claim a cell. */
.card {
  --accent: color-mix(in srgb, var(--tier-color) 62%, #6f776b);
  position: relative;
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 0.7rem;
  background: rgba(24, 30, 22, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 3px solid var(--accent);
  border-radius: 9px;
  padding: 0.75rem 0.85rem;
  overflow: hidden;
  transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
}

/* Locked is dimmed LESS than before — the earned signal no longer leans on the opacity
   delta, so an in-progress "2/10" finally reads. */
.card:not(.earned) { opacity: 0.85; }

/* The only opaque card in the grid, so it stays a solid object over any game background.
   The tint is a background-IMAGE above an opaque background-color, so a translucent tier
   colour can never punch a hole back through it. */
.card.earned {
  opacity: 1;
  --accent: var(--tier-color);
  background-color: #191f17;
  background-image: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tier-color) 32%, transparent) 0%,
    color-mix(in srgb, var(--tier-color) 11%, transparent) 48%,
    color-mix(in srgb, var(--tier-color) 5%, transparent) 100%
  );
  border-color: color-mix(in srgb, var(--tier-color) 45%, transparent);
  border-left-color: var(--accent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 4px 14px -10px rgba(0, 0, 0, 0.9);
}

/* Corner flag — a rotated square the card's own overflow:hidden clips to a wedge. A mark at
   a fixed position, so it still lands when the grid is skimmed and the medallion is a smudge. */
.card.earned::after {
  content: '';
  position: absolute;
  top: -11px;
  right: -11px;
  width: 22px;
  height: 22px;
  transform: rotate(45deg);
  background: var(--tier-color);
  pointer-events: none;
}

.medallion {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  color: rgba(255, 255, 255, 0.34);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* The chip inverts: dark ink knocked out of a light tier plate. Both gradient stops mix
   toward white and never toward black — that is what keeps bronze as bright as platinum. */
.card.earned .medallion {
  color: rgba(12, 16, 10, 0.92);
  font-size: 21px;
  font-weight: 700;
  background-color: #e9ece4;
  background-image: linear-gradient(160deg,
    color-mix(in srgb, var(--tier-color) 62%, #ffffff),
    color-mix(in srgb, var(--tier-color) 88%, #ffffff));
  border-color: color-mix(in srgb, var(--tier-color) 55%, #ffffff);
  box-shadow: 0 0 14px -5px var(--tier-color), inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.name { font-weight: 600; font-size: 0.92rem; color: rgba(255, 255, 255, 0.92); }
.card.earned .name { color: #ffffff; padding-right: 12px; } /* clears the corner wedge */

.desc {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.35;
  margin-top: 1px;
}
.card.earned .desc { color: rgba(255, 255, 255, 0.68); }

/* Masked reads as an empty slot rather than a card, and drops the tier tint entirely — the
   name used to print in var(--tier-color), which leaked a hidden accolade's tier. */
.card.masked {
  border-style: dashed;
  border-left-style: solid;
  border-left-color: rgba(255, 255, 255, 0.14);
}
.card.masked .medallion { border-style: dashed; border-color: rgba(255, 255, 255, 0.2); }
.card.masked .name { color: rgba(255, 255, 255, 0.45); letter-spacing: 3px; }
.card.masked .desc { font-style: italic; }

.foot { display: flex; align-items: center; gap: 0.6rem; margin-top: 6px; min-height: 14px; }

/* Sits in the slot the progress bar vacates, so an earned card is no taller than a locked
   one. The 5px rotated square echoes the header ladder's marker. */
.done {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--tier-color) 55%, #ffffff);
}
.done::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 1px;
  transform: rotate(45deg);
  background: var(--tier-color);
}

.card.earned .pts { color: rgba(255, 255, 255, 0.9); }

.bar {
  flex: 1;
  height: 4px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
}
.bar i { display: block; height: 100%; background: var(--accent); border-radius: 3px; }

.frac { font-size: 0.62rem; color: rgba(255, 255, 255, 0.55); font-variant-numeric: tabular-nums; }

.empty { color: rgba(255, 255, 255, 0.45); padding: 2rem; text-align: center; }
</style>
