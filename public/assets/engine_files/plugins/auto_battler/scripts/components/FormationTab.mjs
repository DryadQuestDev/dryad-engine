const { game, vue } = window.engine;
const { ref, computed, defineComponent } = vue;

import { checkLeadership } from '../main.mjs';

const { CharacterFace, CharacterStats, AbilitiesViewer } = window.engine.components;


export const FormationTab = defineComponent({
  components: { CharacterFace, CharacterStats, AbilitiesViewer },
  setup() {
    const party = computed(() => game.getParty());

    // Get grid size from plugin config
    const battleConfig = game.getData('plugins_data/auto_battler/battle_config');
    const gridRows = battleConfig?.rows_size;
    const gridCols = battleConfig?.columns_size;

    // Position store
    const positionStore = game.getStore('battle_positions');

    // Selection state
    const selectedCharId = ref(null);

    // Grid state as reactive computed
    // Mirror columns so front line (col 0) displays on the right, matching battle grid
    const grid = computed(() => {
      const result = [];
      for (let row = 0; row < gridRows; row++) {
        const rowData = [];
        for (let col = 0; col < gridCols; col++) {
          const dataCol = gridCols - 1 - col;
          const key = `${row}_${dataCol}`;
          const charId = positionStore.get(key);
          rowData.push({
            row, col: dataCol, key,
            character: charId ? game.getCharacter(charId) : null
          });
        }
        result.push(rowData);
      }
      return result;
    });

    // Unassigned party members
    const unassignedCharacters = computed(() => {
      const assignedIds = new Set();
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const charId = positionStore.get(`${row}_${col}`);
          if (charId) assignedIds.add(charId);
        }
      }
      return party.value.filter(c => !assignedIds.has(c.id));
    });

    const selectedCharacter = computed(() => {
      if (!selectedCharId.value) return null;
      return game.getCharacter(selectedCharId.value);
    });

    const isSelectedInFormation = computed(() => {
      if (!selectedCharId.value) return false;
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          if (positionStore.get(`${row}_${col}`) === selectedCharId.value) return true;
        }
      }
      return false;
    });

    // Leadership
    const leadership = computed(() => checkLeadership());
    const hasLeadership = computed(() => leadership.value.budget > 0);

    function getLeadershipCost(character) {
      return character?.getStat('leadership_cost') || 0;
    }

    function selectCharacter(id) {
      selectedCharId.value = selectedCharId.value === id ? null : id;
    }

    function handleCellClick(row, col, cell) {
      if (cell.character) {
        // Click occupied cell -> select that character
        selectCharacter(cell.character.id);
      } else if (selectedCharId.value) {
        // Click empty cell with any character selected -> place/move them
        assignToCell(row, col, selectedCharId.value);
        selectedCharId.value = null;
      }
    }

    function assignToCell(row, col, characterId) {
      const character = game.getCharacter(characterId);
      if (!game.trigger('formation_add', character, row, col)) return;
      // Remove from previous position
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          if (positionStore.get(`${r}_${c}`) === characterId) {
            positionStore.delete(`${r}_${c}`);
          }
        }
      }
      positionStore.set(`${row}_${col}`, characterId);
    }

    function removeSelected() {
      if (!selectedCharId.value) return;
      if (!game.trigger('formation_remove', selectedCharacter.value)) return;
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          if (positionStore.get(`${r}_${c}`) === selectedCharId.value) {
            positionStore.delete(`${r}_${c}`);
          }
        }
      }
      selectedCharId.value = null;
    }

    const statTags = battleConfig?.formation_stat_tags || [];

    function getLine(id) { return game.getLine(id); }

    return {
      grid,
      gridRows,
      gridCols,
      unassignedCharacters,
      selectedCharId,
      selectedCharacter,
      isSelectedInFormation,
      statTags,
      leadership,
      hasLeadership,
      getLeadershipCost,
      selectCharacter,
      handleCellClick,
      removeSelected,
      getLine
    };
  },
  template: /*html*/`
    <div class="formation-tab">
      <h3>{{ getLine('formation_title') }}</h3>

      <!-- Leadership budget -->
      <div v-if="hasLeadership" class="leadership-info" :class="{ overflow: leadership.overflow }">
        <span class="leadership-label">{{ getLine('leadership_budget') }}:</span>
        <span class="leadership-value">{{ leadership.total }} / {{ leadership.budget }}</span>
      </div>

      <p class="formation-hint">{{ getLine('formation_hint') }}</p>

      <!-- Reserves on top -->
      <div class="reserves-section">
        <div class="character-pool">
          <div v-for="char in unassignedCharacters" :key="char.id"
            class="pool-character"
            :class="{ selected: selectedCharId === char.id }"
            @click="selectCharacter(char.id)">
            <div class="pool-character-inner">
              <CharacterFace :character="char" :showName="true" :static-face-force="true" />
              <div v-if="getLeadershipCost(char)" class="leadership-cost-overlay">
                {{ getLeadershipCost(char) }}
              </div>
            </div>
          </div>
          <div v-if="unassignedCharacters.length === 0" class="empty-pool">
            {{ getLine('formation_all_assigned') }}
          </div>
        </div>
      </div>

      <!-- Grid + Abilities side by side -->
      <div class="formation-content">
        <div class="grid-scroll">
          <div class="battle-grid" :style="{
          gridTemplateRows: 'repeat(' + gridRows + ', 100px)',
          gridTemplateColumns: 'repeat(' + gridCols + ', 100px)'
        }">
          <template v-for="row in grid">
            <div v-for="cell in row" :key="cell.key"
              class="grid-cell"
              :class="{ 'placeable': !cell.character && selectedCharId }"
              @click="handleCellClick(cell.row, cell.col, cell)">
              <div v-if="cell.character"
                class="cell-character"
                :class="{ selected: selectedCharId === cell.character.id }">
                <div class="cell-character-inner">
                  <CharacterFace :character="cell.character" :showName="true" :borderRadius="8" nameStyle="overlay" :static-face-force="true" />
                  <div v-if="getLeadershipCost(cell.character)" class="leadership-cost-overlay">
                    {{ getLeadershipCost(cell.character) }}
                  </div>
                </div>
              </div>
              <span v-else class="empty-slot">+</span>
            </div>
          </template>
          </div>
        </div>

        <!-- Abilities panel -->
        <div v-if="selectedCharacter" class="abilities-panel">
          <h3 class="selected-name">{{ selectedCharacter.getName() }}</h3>
          <button v-if="isSelectedInFormation" class="remove-btn" @click="removeSelected">
            {{ getLine('formation_remove_btn') }}
          </button>
          <CharacterStats :character="selectedCharacter" :tags="statTags" :no-headers="true" />
          <AbilitiesViewer :character="selectedCharacter" :show-delta="false" />
        </div>
      </div>
    </div>
  `
});
