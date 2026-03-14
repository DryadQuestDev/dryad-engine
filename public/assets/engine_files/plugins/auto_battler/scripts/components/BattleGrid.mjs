/// <reference path="../dtypes.d.ts" />

const { game, vue, gsap } = window.engine;
const { computed, defineComponent, watch, nextTick, ref } = vue;
import { currentBattle, BASE_DELAY, targetHighlight } from '../battle-flow.mjs';
import { GridActor } from './GridActor.mjs';

export const BattleGrid = defineComponent({
  components: { GridActor },
  props: ['side'],
  emits: ['select'],
  setup(/** @type {{ side: 'player' | 'enemy' }} */ props) {
    const battleConfig = game.getData('plugins_data/auto_battler/battle_config');
    const gridRows = battleConfig?.rows_size ?? 5;
    const gridCols = battleConfig?.columns_size ?? 3;
    const gridEl = ref(null);

    const gridData = computed(() => {
      const battle = currentBattle.value;
      if (!battle) return {};
      return props.side === 'player' ? battle.playerGrid : battle.enemyGrid;
    });

    const grid = computed(() => {
      const data = gridData.value;
      const result = [];
      for (let row = 0; row < gridRows; row++) {
        const rowData = [];
        for (let col = 0; col < gridCols; col++) {
          // Player grid mirrors columns so front line (col 0) faces center
          const dataCol = props.side === 'player' ? (gridCols - 1 - col) : col;
          const key = `${row}_${dataCol}`;
          const charId = data[key];
          rowData.push({
            row, col, key,
            character: charId ? game.getCharacter(charId) : null
          });
        }
        result.push(rowData);
      }
      return result;
    });

    const currentActorId = computed(() => {
      const battle = currentBattle.value;
      if (!battle) return null;
      return battle.activeActorId;
    });

    function isCurrentActor(cell) {
      return cell.character && cell.character.id === currentActorId.value;
    }

    const highlightCells = computed(() => {
      const h = targetHighlight.value;
      if (!h || h.side !== props.side) return null;
      return h;
    });

    function cellBorderColor(cell) {
      const h = highlightCells.value;
      if (h && (h.primary === cell.key || h.cells.includes(cell.key))) {
        return h.isFriendly ? 'rgba(66, 185, 131, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      }
      return null;
    }

    // Animate characters sliding between cells when grid changes (e.g. relocate_self move)
    // Uses logical cell tracking instead of pixel positions to avoid spurious animations on death
    const prevCells = {};
    // Seed with initial grid state so the first move animates
    const initialData = gridData.value;
    for (const key in initialData) {
      if (initialData[key]) prevCells[initialData[key]] = key;
    }

    watch(grid, () => {
      const el = gridEl.value;
      if (!el) return;

      // Build new cell mapping (charId -> cellKey) from reactive grid data
      const data = gridData.value;
      const newCells = {};
      for (const key in data) {
        if (data[key]) newCells[data[key]] = key;
      }

      // Only animate characters that actually moved to a different cell
      const movedChars = new Set();
      for (const charId in newCells) {
        if (prevCells[charId] && prevCells[charId] !== newCells[charId]) {
          movedChars.add(charId);
        }
      }

      // Capture old DOM positions for moved characters (DOM still shows old state in pre-flush)
      const oldPositions = {};
      if (movedChars.size > 0) {
        for (const cellEl of el.querySelectorAll('[data-char-id]')) {
          const charId = cellEl.dataset.charId;
          if (!movedChars.has(charId)) continue;
          const rect = cellEl.getBoundingClientRect();
          oldPositions[charId] = { x: rect.left, y: rect.top };
        }
      }

      // Update tracking for next trigger
      for (const charId in prevCells) delete prevCells[charId];
      Object.assign(prevCells, newCells);

      if (movedChars.size === 0) return;

      nextTick(() => {
        const speed = game.getState('battle_speed') || 1;
        const duration = (BASE_DELAY / speed) / 1000;

        for (const cellEl of el.querySelectorAll('[data-char-id]')) {
          const charId = cellEl.dataset.charId;
          if (!oldPositions[charId]) continue;

          const newRect = cellEl.getBoundingClientRect();
          const dx = oldPositions[charId].x - newRect.left;
          const dy = oldPositions[charId].y - newRect.top;

          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            const actor = cellEl.querySelector('.grid-actor');
            if (actor) {
              gsap.from(actor, { x: dx, y: dy, duration, ease: 'power2.out' });
            }
          }
        }
      });
    }, { flush: 'pre' });

    return { grid, gridRows, gridCols, isCurrentActor, highlightCells, cellBorderColor, gridEl };
  },
  template: /*html*/`
    <div class="battle-grid-wrapper">
      <div class="battle-grid" ref="gridEl" :style="{
        gridTemplateRows: 'repeat(' + gridRows + ', 110px)',
        gridTemplateColumns: 'repeat(' + gridCols + ', 110px)'
      }">
        <template v-for="row in grid">
          <div v-for="cell in row" :key="cell.key"
            class="battle-cell"
            :data-char-id="cell.character?.id"
            :class="{
              'active-actor': isCurrentActor(cell),
              'has-character': !!cell.character,
              'target-primary-hostile': highlightCells && !highlightCells.isFriendly && !highlightCells.borderOnly && highlightCells.primary === cell.key,
              'target-primary-friendly': highlightCells && highlightCells.isFriendly && !highlightCells.borderOnly && highlightCells.primary === cell.key,
              'target-primary-border': highlightCells && highlightCells.borderOnly && highlightCells.primary === cell.key,
              'target-aoe-hostile': highlightCells && !highlightCells.isFriendly && highlightCells.cells.includes(cell.key) && highlightCells.primary !== cell.key,
              'target-aoe-friendly': highlightCells && highlightCells.isFriendly && highlightCells.cells.includes(cell.key) && highlightCells.primary !== cell.key
            }"
            @click="cell.character && $emit('select', cell.character)">
            <GridActor v-if="cell.character" :character="cell.character"
              :isActive="isCurrentActor(cell)"
              :borderColor="cellBorderColor(cell)" />
            <span v-else class="empty-battle-cell"></span>
          </div>
        </template>
      </div>
    </div>
  `
});
