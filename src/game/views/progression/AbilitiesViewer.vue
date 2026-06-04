<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import AbilityCard from './AbilityCard.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const props = withDefaults(defineProps<{
  character: Character;
  showDelta?: boolean;
}>(), {
  showDelta: false
});

const game = Game.getInstance();

const selectedAbilityId = ref<string | null>(null);
const activeTab = ref<string>('');

const grouped = computed(() => props.character.getGroupedAbilities());
const useGroups = computed(() => grouped.value.useGroups);
const availableGroups = computed(() => grouped.value.groups);

const displayedAbilityIds = computed(() => {
  if (!useGroups.value) {
    return grouped.value.groups[0]?.abilityIds || [];
  }
  const group = grouped.value.groups.find(g => g.id === activeTab.value);
  return group?.abilityIds || [];
});

function setTab(tab: string) {
  activeTab.value = tab;
}

// Reset tab when groups change
watch(availableGroups, (groups) => {
  if (groups.length > 0 && !groups.some(g => g.id === activeTab.value)) {
    activeTab.value = groups[0].id;
  }
}, { immediate: true });

// Auto-select first ability when displayed abilities change
watch(displayedAbilityIds, (ids) => {
  if (ids.length > 0 && (!selectedAbilityId.value || !ids.includes(selectedAbilityId.value))) {
    selectedAbilityId.value = ids[0];
  } else if (ids.length === 0) {
    selectedAbilityId.value = null;
  }
}, { immediate: true });

function getAbilityMeta(abilityId: string): Record<string, any> {
  const ability = props.character.getAbility(abilityId);
  if (ability) return ability.meta;
  const template = game.characterSystem.abilityTemplatesMap.get(abilityId);
  return template?.meta || {};
}

function selectAbility(abilityId: string) {
  selectedAbilityId.value = abilityId;
}
</script>

<template>
  <div class="abilities-viewer">
    <CustomComponentContainer slot="abilities-viewer-top" :context="{ character }" />

    <div v-if="displayedAbilityIds.length === 0 && !useGroups" class="empty-state">
      No abilities
    </div>

    <div v-else class="abilities-layout">
      <div class="ability-detail" v-if="selectedAbilityId">
        <AbilityCard :abilityId="selectedAbilityId" :characterId="character.id" :showDelta="showDelta" />
      </div>

      <div class="ability-list-wrapper">
        <div v-if="useGroups" class="ability-group-tabs">
          <button v-for="g in availableGroups" :key="g.id" class="ability-group-tab"
            :class="{ active: activeTab === g.id }" @click="setTab(g.id)">{{ g.name }}</button>
        </div>

        <div class="ability-list">
          <div v-for="abilityId in displayedAbilityIds" :key="abilityId" class="ability-item"
            :class="{ selected: selectedAbilityId === abilityId, unusable: !game.isAbilityUsable(character.id, abilityId) }" @click="selectAbility(abilityId)">
            <img v-if="getAbilityMeta(abilityId).icon" :src="getAbilityMeta(abilityId).icon" class="ability-icon"
              @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')" />
            <span class="ability-name">{{ getAbilityMeta(abilityId).name || abilityId }}</span>
          </div>
          <CustomComponentContainer slot="abilities-viewer-list" :context="{ character }" />
        </div>
      </div>
    </div>

    <CustomComponentContainer slot="abilities-viewer-bottom" :context="{ character }" />
  </div>
</template>

<style scoped>
.abilities-viewer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px;
  container-type: inline-size;
}

.empty-state {
  color: #888;
  text-align: center;
  padding: 20px;
}

.abilities-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.ability-detail {
  flex: 0 0 400px;
}

.ability-list-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

@container (max-width: 600px) {
  .abilities-layout {
    flex-direction: column;
  }

  .ability-detail {
    width: 100%;
    order: 2;
  }

  .ability-list-wrapper {
    order: 1;
  }
}

.ability-group-tabs {
  display: flex;
  gap: 4px;
}

.ability-group-tab {
  padding: 4px 12px;
  background: rgba(40, 40, 40, 0.8);
  border: 1px solid #444;
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 12px;
}

.ability-group-tab:hover {
  color: #ddd;
  border-color: #666;
}

.ability-group-tab.active {
  color: #42b983;
  border-color: #42b983;
}

.ability-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
}

.ability-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(40, 40, 40, 0.9);
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
}

.ability-item:hover {
  outline: 2px solid #9dd0b9;
}

.ability-item.selected {
  outline: 2px solid #42b983;
}

.ability-icon {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 3px;
}

.ability-name {
  color: #ddd;
  font-size: 13px;
}

.ability-item.selected .ability-name {
  color: #42b983;
}

/* Unusable (a registered gameplay system reports the ability can't be used) — greyed badge. */
.ability-item.unusable {
  opacity: 0.55;
  border-color: rgba(255, 255, 255, 0.08);
}

.ability-item.unusable .ability-icon {
  filter: grayscale(1) brightness(0.5);
}

.ability-item.unusable:not(.selected) .ability-name {
  color: rgba(255, 255, 255, 0.4);
}
</style>
