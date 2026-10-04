<script setup lang="ts">
import { computed } from 'vue';
import { Item } from '../../core/character/item';
import { Game } from '../../game';
import { Global } from '../../../global/global';

// Stat deltas of equipping an item, one column per slot instance it fits (Character.compareItem).
// Several columns at once rather than one switchable comparison: for an item that fits several
// slots, WHICH slot is the decision, and that needs every slot side by side.

const props = defineProps<{
  item: Item;
  characterId?: string;
}>();

const game = Game.getInstance();

// Past this many slots the columns no longer fit the card, so it falls back to the one slot a
// plain equip would pick.
const MAX_COLUMNS = 3;

const columns = computed(() => {
  const character = props.characterId
    ? game.getCharacter(props.characterId)
    : game.characterSystem.selectedCharacter.value;
  if (!character) return [];
  let list = character.compareItem(props.item);
  if (list.length > MAX_COLUMNS) {
    const target = character.getRelevantSlotForItem(props.item);
    list = list.filter(column => column.slot === target);
  }
  // Against empty slots only, every column would restate the item's own stat list.
  return list.some(column => column.equipped) ? list : [];
});

const GOOD = '#42b983';
const BAD = '#ff453a';

// Same rounding as the card's stat list (stat precision + 1), so a delta never disagrees with it.
function roundStat(statId: string, value: number): number {
  const factor = Math.pow(10, (game.characterSystem.statsMap.get(statId)?.precision ?? 0) + 1);
  return Math.round(value * factor) / factor;
}

function formatCell(statId: string, delta: number | undefined): { text: string; color: string } | null {
  if (!delta) return null;
  const rounded = roundStat(statId, delta);
  if (!rounded) return null;
  const stat = game.characterSystem.statsMap.get(statId);
  const isGood = stat?.reduction_is_good ? rounded < 0 : rounded > 0;
  const color = isGood ? GOOD : BAD;
  if (stat?.is_binary) return { text: rounded > 0 ? '✓' : '✗', color };
  return { text: `${rounded > 0 ? '▲' : '▼'}${Math.abs(rounded)}`, color };
}

// Rows are every visible stat that changes in any column — the item's own stats first, then the
// ones only the equipped items carry, which is what the swap costs.
const rows = computed(() => {
  const visible = game.coreSystem.getDebugSetting('show_hidden_stats')
    ? game.characterSystem.statsMap
    : game.characterSystem.statsVisibleMap;
  const ids: string[] = [];
  for (const column of columns.value) {
    for (const statId in column.stats) {
      if (visible.has(statId) && !ids.includes(statId)) ids.push(statId);
    }
  }
  return ids
    .map(statId => ({
      statId,
      name: game.characterSystem.statsMap.get(statId)?.name || statId,
      cells: columns.value.map(column => formatCell(statId, column.stats[statId])),
    }))
    .filter(row => row.cells.some(cell => cell));
});

const gridStyle = computed(() => ({
  gridTemplateColumns: `minmax(0, 1fr) repeat(${columns.value.length}, minmax(3em, max-content))`,
}));

const label = computed(() => Global.getInstance().getString('item_compare.label'));
const emptyLabel = computed(() => Global.getInstance().getString('item_compare.empty'));
</script>

<template>
  <div v-if="rows.length" class="item-compare">
    <h5>{{ label }}</h5>
    <div class="compare-grid" :style="gridStyle">
      <span></span>
      <div v-for="(column, i) in columns" :key="i" class="compare-head">
        <span class="compare-slot" :title="column.slotName">{{ column.slotName }}</span>
        <img v-if="column.equipped?.getImage()" :src="column.equipped.getImage()"
          :alt="column.equipped.getName()" :title="column.equipped.getName()" class="compare-icon" />
        <span v-else-if="column.equipped" class="compare-equipped-name" :title="column.equipped.getName()">
          {{ column.equipped.getName() }}
        </span>
        <span v-else class="compare-empty">{{ emptyLabel }}</span>
      </div>

      <template v-for="row in rows" :key="row.statId">
        <span class="compare-stat">{{ row.name }}</span>
        <span v-for="(cell, i) in row.cells" :key="i" class="compare-cell"
          :class="{ unchanged: !cell }" :style="cell ? { color: cell.color } : undefined">
          {{ cell ? cell.text : '·' }}
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.item-compare {
  margin-top: 8px;
  border-top: 1px solid #444;
  padding-top: 8px;
}

.item-compare h5 {
  margin: 0 0 6px 0;
  font-size: 1em;
  color: #ffd700;
}

.compare-grid {
  display: grid;
  column-gap: 6px;
  row-gap: 2px;
  align-items: center;
  font-size: 0.85em;
}

.compare-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  margin-bottom: 4px;
}

/* Capped so a long name widens its column only so far before it ellipsizes. */
.compare-slot,
.compare-equipped-name,
.compare-empty {
  max-width: 6em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75em;
}

.compare-slot {
  color: #ccc;
  font-weight: 600;
}

.compare-equipped-name {
  color: #999;
}

.compare-empty {
  color: #777;
  font-style: italic;
}

.compare-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.25);
}

.compare-stat {
  color: #ccc;
  min-width: 0;
  overflow-wrap: anywhere;
}

.compare-cell {
  text-align: center;
  font-weight: 600;
  white-space: nowrap;
}

.compare-cell.unchanged {
  color: #666;
  font-weight: normal;
}
</style>
